import { Composer } from 'grammy'
import type { CustomContext } from '../types/context.js'

export const startController = new Composer<CustomContext>()
startController.command('start', async ctx => {
	await ctx.text('start', {
		name: ctx.entities.user.name,
		chatName: ctx.entities.chat?.title ?? 'PM'
	})
})
