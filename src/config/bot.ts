import { autoRetry } from "@grammyjs/auto-retry";
import type { I18n } from "@grammyjs/i18n";
import { run } from "@grammyjs/runner";
import { Bot as TelegramBot, session } from "grammy";

import { downloadController } from "../controllers/download.ts";
import { mediaDownloadController } from "../controllers/media-download.ts";
import { settingsController } from "../controllers/settings.ts";
import { startController } from "../controllers/start.ts";
import { getOrCreateChat } from "../services/chat.ts";
import { createReplyWithTextFunc } from "../services/context.ts";
import type { CustomContext } from "../types/context.ts";
import type { Chat, Database } from "../types/database.ts";
import type { Bot } from "../types/telegram.ts";
import { APP_ENV } from "./env.ts";
import { initLocaleEngine } from "./locale-engine.ts";

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
	bot.use(startController);
	bot.use(settingsController);

	bot.use(downloadController);

	bot.use(mediaDownloadController);
}

export async function startBot(database: Database) {
	const localesPath = new URL("../locales/", import.meta.url).pathname;

	const i18n = initLocaleEngine(localesPath);
	const bot = new TelegramBot<CustomContext>(APP_ENV.TOKEN);

	bot.api.config.use(
		autoRetry({
			rethrowHttpErrors: true,
			maxRetryAttempts: 5,
		}),
	);

	setupMiddlewares(bot, i18n);
	extendContext(bot, database);
	setupControllers(bot);

	await bot.api.deleteWebhook();

	return run(bot);
}
