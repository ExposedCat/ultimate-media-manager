import { setTimeout } from "node:timers/promises";

import type { I18n } from "@grammyjs/i18n";
import { Bot as TelegramBot, session } from "grammy";

import { mediaDownloadController } from "../controllers/media-download.js";
import { searchController } from "../controllers/search.js";
import { settingsController } from "../controllers/settings.js";
import { startController } from "../controllers/start.js";
import { ytVideoDownloadController } from "../controllers/yt-video-download.js";
import { resolvePath } from "../helpers/resolve-path.js";
import { getOrCreateChat } from "../services/chat.js";
import { createReplyWithTextFunc } from "../services/context.js";
import type { CustomContext } from "../types/context.js";
import type { Chat, Database } from "../types/database.js";
import type { Bot } from "../types/telegram.js";
import { initLocaleEngine } from "./locale-engine.js";

function extendContext(bot: Bot, database: Database) {
	bot.use(async (ctx, next) => {
		ctx.text = createReplyWithTextFunc(ctx);
		ctx.db = database;

		if (ctx.chat && ctx.from) {
			let chat: Chat | null = null;
			if (ctx.chat.type !== "private") {
				chat = await getOrCreateChat({
					db: database,
					chatId: ctx.chat.id,
					title: ctx.chat.title,
				});
			}

			ctx.objects = { chat };
		}

		await next();
	});
}

function setupMiddlewares(bot: Bot, localeEngine: I18n) {
	bot.use(
		session({
			getSessionKey: (ctx) =>
				ctx.chat?.id.toString() ?? ctx.from?.id.toString() ?? "null",
		}),
	);
	bot.use(localeEngine.middleware());
	bot.catch(console.error);
}

function setupControllers(bot: Bot) {
	bot.use(searchController);

	bot.use(startController);
	bot.use(settingsController);

	bot.use(ytVideoDownloadController);

	bot.use(mediaDownloadController);
}

export async function startBot(database: Database) {
	const localesPath = resolvePath(import.meta.url, "../locales");

	const i18n = initLocaleEngine(localesPath);
	const bot = new TelegramBot<CustomContext>(process.env.TOKEN);

	setupMiddlewares(bot, i18n);
	extendContext(bot, database);
	setupControllers(bot);

	// NOTE: Resolves only when bot is stopped
	// so give it a second to start instead of `await`
	void bot.start({
		drop_pending_updates: true,
	});
	return await setTimeout(1_000);
}
