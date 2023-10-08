import type { I18n } from '@grammyjs/i18n/dist/source/i18n.js'
import { Bot as TelegramBot, session } from 'grammy'

import { resolvePath } from '../helpers/resolve-path.js'
import { createReplyWithTextFunc } from '../services/context.js'
import type { CustomContext } from '../types/context.js'
import type { Chat, Database } from '../types/database.js'
import { initLocaleEngine } from './locale-engine.js'
import { startController } from '../controllers/start.js'
import { stopController } from '../controllers/stop.js'
import type { Bot } from '../types/telegram.js'
import { buildName, getOrCreatePlayer } from '../services/user.js'
import { getOrCreateChat } from '../services/chat.js'

function extendContext(bot: Bot, database: Database) {
	bot.use(async (ctx, next) => {
		if (!ctx.chat || !ctx.from) {
			return
		}

		ctx.text = createReplyWithTextFunc(ctx)
		ctx.db = database

		let chat: Chat | null = null
		if (ctx.chat.type !== 'private') {
			chat = await getOrCreateChat({
				db: database,
				chatId: ctx.chat.id,
				title: ctx.chat.title
			})
		}

		ctx.entities = {
			user: await getOrCreatePlayer({
				db: database,
				userId: ctx.from.id,
				name: buildName(ctx.from.first_name, ctx.from.last_name)
			}),
			chat
		}

		await next()
	})
}

function setupMiddlewares(bot: Bot, localeEngine: I18n) {
	bot.use(session())
	bot.use(localeEngine.middleware())
	bot.catch(console.error)
}

function setupControllers(bot: Bot) {
	bot.use(startController)
	bot.use(stopController)
}

export async function startBot(database: Database) {
	const localesPath = resolvePath(import.meta.url, '../locales')
	const i18n = initLocaleEngine(localesPath)
	const bot = new TelegramBot<CustomContext>(process.env.TOKEN)
	extendContext(bot, database)
	setupMiddlewares(bot, i18n)
	setupControllers(bot)

	// NOTE: Resolves only when bot is stopped
	// so give it a second to start instead of `await`
	bot.start()
	return new Promise(resolve => setTimeout(resolve, 1_000))
}
