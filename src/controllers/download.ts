import { Composer } from "grammy";

import {
	extractMessageText,
	extractUrlsFromMessage,
} from "../services/context-message.ts";
import { matchDownloadCommandInput } from "../services/sources.ts";
import { downloadMatchedUrl } from "../services/url-download.ts";
import type { CustomContext } from "../types/context.ts";

function getCommandUrlSource(ctx: CustomContext) {
	const directUrl =
		typeof ctx.match === "string" ? ctx.match.trim() : ctx.match?.[0]?.trim();
	if (directUrl) {
		return { url: directUrl, sourceMessage: ctx.message };
	}

	const repliedMessage = ctx.message?.reply_to_message;
	const repliedUrl =
		extractUrlsFromMessage(repliedMessage)[0] ??
		extractMessageText(repliedMessage);

	return repliedUrl ? { url: repliedUrl, sourceMessage: repliedMessage } : null;
}

export const downloadController = new Composer<CustomContext>();

downloadController
	.chatType(["supergroup", "private", "group"])
	.command("download", async (ctx, next) => {
		if (!ctx.message || !ctx.from || !ctx.chat) {
			await next();
			return;
		}

		const urlSource = getCommandUrlSource(ctx);
		if (!urlSource) {
			console.info("[/download] No URL found in command or reply", {
				userId: ctx.from.id,
				chatId: ctx.chat.id,
				messageId: ctx.message.message_id,
			});
			await next();
			return;
		}

		console.info("[/download] Processing URL", {
			userId: ctx.from.id,
			chatId: ctx.chat.id,
			messageId: ctx.message.message_id,
			url: urlSource.url,
		});

		const sent = await downloadMatchedUrl(
			ctx,
			urlSource.url,
			matchDownloadCommandInput,
			urlSource.sourceMessage,
		);

		console.info("[/download] Completed", {
			userId: ctx.from.id,
			chatId: ctx.chat.id,
			messageId: ctx.message.message_id,
			url: urlSource.url,
			sent,
		});
		return true;
	});
