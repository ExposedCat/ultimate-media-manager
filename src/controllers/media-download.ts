import { Composer } from 'grammy'

import type { CustomContext } from '../types/context.js'
import { extractDirectUrl } from '../services/direct-url-extractor.js'

const TIKTOK_URL_MATCH = 'tiktok.com/'
const INSTAGRAM_URL_MATCH = 'instagram.com/reel/'

export const mediaDownloadController = new Composer<CustomContext>()
mediaDownloadController.on(
	['message::url', 'message::text_link'],
	async (ctx, next) => {
		const text = ctx.message.text
		const entities = ctx.message.entities ?? ctx.message.caption_entities ?? []

		const matchingEntity = entities.find(
			entity =>
				(entity.type === 'text_link' &&
					entity.url.includes(TIKTOK_URL_MATCH) &&
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

			const urlType = url.includes(TIKTOK_URL_MATCH)
				? 'tiktok'
				: url.includes(INSTAGRAM_URL_MATCH)
				? 'instagram'
				: null

			if (urlType !== null) {
				const directUrl = await extractDirectUrl(ctx.scrapper, url, urlType)
				if (directUrl) {
					try {
						await ctx.replyWithVideo(directUrl, {
							caption: ctx.i18n.t('promoCaption', {
								viewUrl: ctx.i18n.t(
									urlType === 'tiktok' ? 'viewOnTikTok' : 'viewOnInstagram',
									{ postUrl: url }
								)
							}),
							parse_mode: 'HTML'
						})

						if (text === url && ctx.entities.chat?.settings.cleanup) {
							try {
								await ctx.deleteMessage()
							} catch {
								// ignore
							}
						}
					} catch (error) {
						console.error('[TTC] Failed to respond with video', { directUrl })
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
