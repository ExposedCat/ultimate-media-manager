import { Composer } from "grammy";

import { extractUrlsFromMessage } from "../services/context-message.ts";
import { downloadMatchedUrl } from "../services/url-download.ts";
import type { CustomContext } from "../types/context.ts";

export const mediaDownloadController = new Composer<CustomContext>();
mediaDownloadController.on(
	["message::url", "message::text_link"],
	async (ctx, next) => {
		if (ctx.message.forward_origin) {
			return;
		}

		const text = ctx.message.text ?? ctx.message.caption ?? "";
		const urls = extractUrlsFromMessage(ctx.message);
		console.info("[AutoDownload] Processing message URLs", {
			userId: ctx.from.id,
			chatId: ctx.chat.id,
			messageId: ctx.message.message_id,
			urlCount: urls.length,
		});

		let shouldCleanup = false;
		let somethingSent = false;

		for (const url of urls) {
			console.info("[AutoDownload] Attempting URL", {
				userId: ctx.from.id,
				chatId: ctx.chat.id,
				messageId: ctx.message.message_id,
				url,
			});
			const sent = await downloadMatchedUrl(ctx, url, undefined, ctx.message);
			if (sent) {
				somethingSent = true;
				if (!shouldCleanup && text === url) {
					shouldCleanup = true;
				}
			}
		}

		if (!somethingSent) {
			console.info("[AutoDownload] No URLs matched", {
				userId: ctx.from.id,
				chatId: ctx.chat.id,
				messageId: ctx.message.message_id,
			});
			return await next();
		}

		if (shouldCleanup && ctx.objects.chat?.settings?.cleanup) {
			try {
				await ctx.deleteMessage();
				console.info("[AutoDownload] Deleted source message after cleanup", {
					chatId: ctx.chat.id,
					messageId: ctx.message.message_id,
				});
			} catch {
				// ignore
			}
		}
	},
);
