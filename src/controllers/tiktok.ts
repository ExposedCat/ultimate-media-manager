import { Composer } from 'grammy'

import type { CustomContext } from '../types/context.js'
import { getTikTokDownloadUrl } from '../services/tiktok.js'

const TIKTOK_URL_MATCH = 'tiktok.com/'

export const tiktokController = new Composer<CustomContext>()
tiktokController.on(
	['message::url', 'message::text_link'],
	async (ctx, next) => {
		const text = ctx.message.text
		const entities = ctx.message.entities ?? ctx.message.caption_entities ?? []

		const matchingEntity = entities.find(
			entity =>
				(entity.type === 'text_link' &&
					entity.url.includes(TIKTOK_URL_MATCH)) ||
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
			if (url.includes(TIKTOK_URL_MATCH)) {
				const directUrl = await getTikTokDownloadUrl(url)
				if (directUrl) {
					try {
						await ctx.replyWithVideo(directUrl, {
							caption: ctx.i18n.t('caption')
						})
					} catch (error) {
						console.error('[TTC] Failed to respond with video', { directUrl })
					}
					if (text === url) {
						try {
							await ctx.deleteMessage()
						} catch {
							// ignore
						}
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
