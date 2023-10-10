import { Composer } from 'grammy'

import type { CustomContext } from '../types/context.js'
import { getInstagramReelDownloadUrl } from '../services/instagram.js'

const INSTAGRAM_URL_MATCH = 'instagram.com/reel/'

export const instagramController = new Composer<CustomContext>()
instagramController.on(
	['message::url', 'message::text_link'],
	async (ctx, next) => {
		const text = ctx.message.text
		const entities = ctx.message.entities ?? ctx.message.caption_entities ?? []

		const matchingEntity = entities.find(
			entity =>
				(entity.type === 'text_link' &&
					entity.url.includes(INSTAGRAM_URL_MATCH)) ||
				entity.type === 'url'
		)

		if (matchingEntity) {
			let url: string
			if (matchingEntity.type === 'text_link') {
				url = matchingEntity.url
			} else if (text && matchingEntity.type === 'url') {
				url = text.slice(matchingEntity.offset, matchingEntity.length)
			} else {
				return await next()
			}
			if (url.includes(INSTAGRAM_URL_MATCH)) {
				const directUrl = await getInstagramReelDownloadUrl(ctx.scrapper, url)
				if (directUrl) {
					try {
						await ctx.replyWithVideo(directUrl, {
							caption: ctx.i18n.t('caption')
						})
					} catch (error) {
						console.error('[IGC] Failed to respond with video', { directUrl })
					}
					try {
						await ctx.deleteMessage()
					} catch {
						// ignore
					}
				}
			} else {
				await next()
			}
		} else {
			await next()
		}
	}
)
