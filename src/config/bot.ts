import { setTimeout } from "node:timers/promises";

import type { I18n } from "@grammyjs/i18n";
import { Bot as TelegramBot, session } from "grammy";

import { mediaDownloadController } from "../controllers/media-download.js";
import { settingsController } from "../controllers/settings.js";
import { startController } from "../controllers/start.js";
import { ytAudioDownloadController } from "../controllers/yt-audio-download.js";
import { resolvePath } from "../helpers/resolve-path.js";
import { getOrCreateChat } from "../services/chat.js";
import { createReplyWithTextFunc } from "../services/context.js";
import { loadBinary } from "../services/yt-dlp.js";
import type { YTDlpWrap } from "../services/yt-dlp.js";
import type { CustomContext } from "../types/context.js";
import type { Chat, Database } from "../types/database.js";
import type { Bot } from "../types/telegram.js";
import { initLocaleEngine } from "./locale-engine.js";

function extendContext(bot: Bot, database: Database, binary: YTDlpWrap) {
	bot.use(async (ctx, next) => {
		if (!ctx.chat || !ctx.from) {
			return;
		}

		ctx.text = createReplyWithTextFunc(ctx);
		ctx.db = database;
		ctx.binary = binary;

		let chat: Chat | null = null;
		if (ctx.chat.type !== "private") {
			chat = await getOrCreateChat({
				db: database,
				chatId: ctx.chat.id,
				title: ctx.chat.title,
			});
		}

		ctx.objects = { chat };

		await next();
	});
}

function setupMiddlewares(bot: Bot, localeEngine: I18n) {
	bot.use(session());
	bot.use(localeEngine.middleware());
	bot.catch(console.error);
}

function setupControllers(bot: Bot) {
	bot.use(startController);
	bot.use(settingsController);

	bot.use(ytAudioDownloadController);

	bot.use(mediaDownloadController);
}

export async function startBot(database: Database) {
	const localesPath = resolvePath(import.meta.url, "../locales");

	const i18n = initLocaleEngine(localesPath);
	const binary = loadBinary();
	const bot = new TelegramBot<CustomContext>(process.env.TOKEN);

	extendContext(bot, database, binary);
	setupMiddlewares(bot, i18n);
	setupControllers(bot);

	// NOTE: Resolves only when bot is stopped
	// so give it a second to start instead of `await`
	void bot.start({
		drop_pending_updates: true,
	});
	return await setTimeout(1_000);
}
