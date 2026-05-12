import { Composer } from "grammy";
import {
	downloadMatchedUrl,
	extractUrlsFromMessage,
} from "../services/url-download.ts";
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

		let shouldCleanup = false;
		let somethingSent = false;

		for (const url of urls) {
			const sent = await downloadMatchedUrl(ctx, url);
			if (sent) {
				somethingSent = true;
				if (!shouldCleanup && text === url) {
					shouldCleanup = true;
				}
			}
		}

		if (!somethingSent) {
			return await next();
		}

		if (shouldCleanup && ctx.objects.chat?.settings?.cleanup) {
			try {
				await ctx.deleteMessage();
			} catch {
				// ignore
			}
		}
	},
);
