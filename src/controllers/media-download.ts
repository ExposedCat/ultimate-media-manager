import type { GrammyError } from 'grammy'
import { Composer, InputFile } from 'grammy'

import type { CustomContext } from '../types/context.js'
import { extractDirectUrl } from '../services/direct-url-extractor.js'
import { downloadFile } from '../helpers/fetch.js'
import { deleteFile } from '../helpers/fs.js'

const TIKTOK_URL_MATCH = 'tiktok.com/'
const INSTAGRAM_URL_MATCH = 'instagram.com/reel/'
const FACEBOOK_URL_MATCH = 'fb.watch/'

export const mediaDownloadController = new Composer<CustomContext>()
mediaDownloadController.on(
	['message::url', 'message::text_link'],
	async (ctx, next) => {
		const text = ctx.message.text
		const entities = ctx.message.entities ?? ctx.message.caption_entities ?? []

		const userName = [ctx.from.first_name, ctx.from.last_name]
			.filter(Boolean)
			.join(' ')

		const matchingEntity = entities.find(
			entity =>
				(entity.type === 'text_link' &&
					(entity.url.includes(TIKTOK_URL_MATCH) ||
						// TODO: Fix on production
						// entity.url.includes(FACEBOOK_URL_MATCH) ||
						entity.url.includes(INSTAGRAM_URL_MATCH))) ||
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
				: url.includes(FACEBOOK_URL_MATCH)
				? 'facebook'
				: null

			const send = (source: string | InputFile) =>
				ctx.replyWithVideo(source, {
					caption: ctx.i18n.t('promoCaption', {
						viewUrl: ctx.i18n.t(`viewOn.${urlType}`, {
							postUrl: url,
							userName,
							userId: ctx.from.id
						})
					}),
					parse_mode: 'HTML',
					reply_to_message_id:
						ctx.message.reply_to_message?.message_id ?? undefined
				})

			const throwError = (error: Error, source: string) =>
				console.error('[TTC] Failed to respond with video', {
					source,
					error
				})

			if (urlType !== null) {
				const directUrl = await extractDirectUrl(ctx.scrapper, url, urlType)
				if (directUrl) {
					let downloaded = false

					try {
						await send(directUrl)
					} catch (object) {
						const error = object as GrammyError
						if (error.message.includes('failed to get HTTP URL content')) {
							const filepath = `/tmp/ummrobot-${Date.now()}-${ctx.from.id}.mp4`
							try {
								await downloadFile(directUrl, filepath)
								await send(new InputFile(filepath))
								downloaded = true
								await deleteFile(filepath)
							} catch (error) {
								throwError(error as Error, filepath)
							}
						} else {
							throwError(error, directUrl)
						}
					}

					if (
						downloaded &&
						text === url &&
						ctx.entities.chat?.settings?.cleanup
					) {
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
