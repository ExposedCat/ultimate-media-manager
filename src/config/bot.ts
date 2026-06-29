import { autoRetry } from "@grammyjs/auto-retry";
import type { I18n } from "@grammyjs/i18n";
import { run } from "@grammyjs/runner";
import { Bot as TelegramBot, session } from "grammy";

import { contextMessageController } from "../controllers/context-message.ts";
import { downloadController } from "../controllers/download.ts";
import { mediaDownloadController } from "../controllers/media-download.ts";
import { settingsController } from "../controllers/settings.ts";
import { startController } from "../controllers/start.ts";
import {
	getOrCreateChat,
	getOrCreateUserSettings,
	getUserSettings,
} from "../services/chat.ts";
import { createReplyWithTextFunc } from "../services/context.ts";
import type { CustomContext } from "../types/context.ts";
import type { Chat, Database, UserSettings } from "../types/database.ts";
import type { Bot } from "../types/telegram.ts";
import { APP_ENV } from "./env.ts";
import { initLocaleEngine } from "./locale-engine.ts";

function extendContext(bot: Bot, database: Database) {
	bot.use(async (ctx, next) => {
		ctx.text = createReplyWithTextFunc(ctx);
		ctx.db = database;
		ctx.objects = {
			chat: null,
			user: null,
			guestReceiverUser: null,
			guestSenderUser: null,
		};

		if (ctx.chat && ctx.from) {
			let chat: Chat | null = null;
			let user: UserSettings | null = null;
			let guestReceiverUser: UserSettings | null = null;
			let guestSenderUser: UserSettings | null = null;

			if (ctx.chat.type === "private") {
				if (ctx.guestMessage) {
					guestReceiverUser = await getUserSettings({
						db: database,
						userId: ctx.chat.id,
					});
					if (ctx.from.id !== ctx.chat.id) {
						guestSenderUser = await getUserSettings({
							db: database,
							userId: ctx.from.id,
						});
					}
				} else {
					user = await getOrCreateUserSettings({
						db: database,
						userId: ctx.from.id,
					});
				}
			} else {
				chat = await getOrCreateChat({
					db: database,
					chatId: ctx.chat.id,
					title: ctx.chat.title,
				});
			}

			ctx.objects = { chat, user, guestReceiverUser, guestSenderUser };
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
	bot.use(contextMessageController);

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

	await bot.api.setMyCommands([
		{ command: "start", description: "About the bot" },
		{ command: "download", description: "Download media from a replied link" },
		{ command: "settings", description: "Configure captions and cleanup" },
	]);

	await bot.api.deleteWebhook();

	return run(bot);
}
