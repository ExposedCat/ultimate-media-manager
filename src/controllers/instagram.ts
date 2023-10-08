import { Composer } from 'grammy'

import type { CustomContext } from '../types/context.js'

const INSTAGRAM_URL_MATCH = 'instagram.com/reel/'

export const instagramController = new Composer<CustomContext>()
instagramController.on(
	[':entities:text_link', ':entities:url'],
	async (ctx, next) => {
		const entities =
			ctx.message?.entities ?? ctx.message?.caption_entities ?? []
		const hasInstagramLink =
			ctx.message?.text.includes(INSTAGRAM_URL_MATCH) ||
			entities.some(
				entity =>
					entity.type === 'text_link' &&
					entity.url.includes(INSTAGRAM_URL_MATCH)
			)

		if (hasInstagramLink) {
			await ctx.text('not_implemented')
		} else {
			await next()
		}
	}
)
