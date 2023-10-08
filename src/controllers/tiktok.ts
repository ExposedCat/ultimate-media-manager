import { Composer } from 'grammy'

import type { CustomContext } from '../types/context.js'

const TIKTOK_URL_MATCH = 'tiktok.com/'

export const tiktokController = new Composer<CustomContext>()
tiktokController.on(
	[':entities:text_link', ':entities:url'],
	async (ctx, next) => {
		const entities =
			ctx.message?.entities ?? ctx.message?.caption_entities ?? []
		const hasTikTokLink =
			ctx.message?.text.includes(TIKTOK_URL_MATCH) ||
			entities.some(
				entity =>
					entity.type === 'text_link' && entity.url.includes(TIKTOK_URL_MATCH)
			)

		if (hasTikTokLink) {
			await ctx.text('not_implemented')
		} else {
			await next()
		}
	}
)
