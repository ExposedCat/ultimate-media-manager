import { Composer, InputFile } from 'grammy'

import type { CustomContext } from '../types/context.js'
import { deleteFile } from '../helpers/fs.js'
import { downloadMedia } from '../services/yt-dlp.js'

const TIKTOK_URL_MATCH = 'tiktok.com/'
const INSTAGRAM_URL_MATCH = 'instagram.com/reel/'
const INSTAGRAM_URL_MATCH2 = 'instagram.com/reels/'
const FACEBOOK_URL_MATCH = 'fb.watch/'
const YOUTUBE_URL_MATCH = 'youtube.com/shorts/'

const SOURCE_URL_MATCHES = [
	TIKTOK_URL_MATCH,
	INSTAGRAM_URL_MATCH,
	INSTAGRAM_URL_MATCH2,
	FACEBOOK_URL_MATCH,
	YOUTUBE_URL_MATCH
]

export const mediaDownloadController = new Composer<CustomContext>()
mediaDownloadController.on(
	['message::url', 'message::text_link'],
	async (ctx, next) => {
		const text = ctx.message.text
		const entities = ctx.message.entities ?? ctx.message.caption_entities ?? []

		if (
			ctx.message.forward_origin?.type === 'user' &&
			ctx.message.forward_origin.sender_user.is_bot
		) {
			return
		}

		const userName = [ctx.from.first_name, ctx.from.last_name]
			.filter(Boolean)
			.join(' ')

		const matchingEntity = entities.find(
			entity =>
				(entity.type === 'text_link' &&
					SOURCE_URL_MATCHES.some(source => entity.url.includes(source))) ||
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
				: url.includes(INSTAGRAM_URL_MATCH) ||
					  url.includes(INSTAGRAM_URL_MATCH2)
					? 'instagram'
					: url.includes(FACEBOOK_URL_MATCH)
						? 'facebook'
						: url.includes(YOUTUBE_URL_MATCH)
							? 'youtube'
							: null

			if (urlType === 'instagram') {
				await ctx.text(
					'promoCaption',
					{
						viewUrl: ctx.i18n.t('viewOn.instagram', {
							postUrl: url,
							userName,
							userId: ctx.from.id
						})
					},
					{
						link_preview_options: {
							is_disabled: false,
							url: url.replace('instagram', 'ddinstagram'),
							prefer_large_media: true,
							show_above_text: true,
						},
						message_thread_id: ctx.message.message_thread_id
					}
				)
				if (text === url && ctx.objects.chat?.settings?.cleanup) {
					try {
						await ctx.deleteMessage()
					} catch {
						// ignore
					}
				}
				return
			}

			const shouldFormat = urlType === 'tiktok'

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
						ctx.message.reply_to_message?.message_id ?? undefined,
					message_thread_id: ctx.message.message_thread_id
				})

			const throwError = (error: Error, source: string) =>
				console.error('[TTC] Failed to respond with video', {
					source,
					error
				})

			if (urlType !== null) {
				let downloaded = false

				const filepath = `/tmp/ummrobot-${Date.now()}-${ctx.from.id}.mp4`
				try {
					const filename = await downloadMedia(
						ctx.binary,
						url,
						filepath,
						shouldFormat
					)
					await send(new InputFile(filename))
					downloaded = true
					await deleteFile(filename)
				} catch (error) {
					throwError(error as Error, filepath)
				}

				if (downloaded && text === url && ctx.objects.chat?.settings?.cleanup) {
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
