import type { I18n } from '@grammyjs/i18n/dist/source/i18n.js'
import { Bot as TelegramBot, session } from 'grammy'

import { resolvePath } from '../helpers/resolve-path.js'
import { createReplyWithTextFunc } from '../services/context.js'
import type { CustomContext } from '../types/context.js'
import type { Chat, Database } from '../types/database.js'
import { initLocaleEngine } from './locale-engine.js'
import { startController } from '../controllers/start.js'
import { instagramController } from '../controllers/instagram.js'
import { tiktokController } from '../controllers/tiktok.js'
import type { Bot } from '../types/telegram.js'
import { getOrCreateChat } from '../services/chat.js'
import { initScrapper } from '../services/instagram.js'
import { setTimeout } from 'timers/promises'
import type { Browser } from 'puppeteer'

function extendContext(bot: Bot, database: Database, scrapper: Browser) {
	bot.use(async (ctx, next) => {
		if (!ctx.chat || !ctx.from) {
			return
		}

		ctx.text = createReplyWithTextFunc(ctx)
		ctx.db = database
		ctx.scrapper = scrapper

		let chat: Chat | null = null
		if (ctx.chat.type !== 'private') {
			chat = await getOrCreateChat({
				db: database,
				chatId: ctx.chat.id,
				title: ctx.chat.title
			})
		}

		ctx.entities = { chat }

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
	bot.use(tiktokController)
	bot.use(instagramController)
}

export async function startBot(database: Database) {
	const localesPath = resolvePath(import.meta.url, '../locales')
	const i18n = initLocaleEngine(localesPath)
	const scrapper = await initScrapper()
	const bot = new TelegramBot<CustomContext>(process.env.TOKEN)
	extendContext(bot, database, scrapper)
	setupMiddlewares(bot, i18n)
	setupControllers(bot)

	// NOTE: Resolves only when bot is stopped
	// so give it a second to start instead of `await`
	bot.start()
	return await setTimeout(1_000)
}
