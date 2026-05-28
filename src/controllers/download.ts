import { Composer } from "grammy";

import {
	extractMessageText,
	extractUrlsFromMessage,
} from "../services/context-message.ts";
import { matchDownloadCommandInput } from "../services/sources.ts";
import { downloadMatchedUrl } from "../services/url-download.ts";
import type { CustomContext } from "../types/context.ts";

function getCommandUrl(ctx: CustomContext) {
	const directUrl =
		typeof ctx.match === "string" ? ctx.match.trim() : ctx.match?.[0]?.trim();
	if (directUrl) {
		return directUrl;
	}

	const repliedMessage = ctx.message?.reply_to_message;
	return (
		extractUrlsFromMessage(repliedMessage)[0] ??
		extractMessageText(repliedMessage) ??
		null
	);
}

export const downloadController = new Composer<CustomContext>();

downloadController
	.chatType(["supergroup", "private", "group"])
	.command("download", async (ctx, next) => {
		if (!ctx.message || !ctx.from || !ctx.chat) {
			await next();
			return;
		}

		const url = getCommandUrl(ctx);
		if (!url) {
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
			url,
		});

		const sent = await downloadMatchedUrl(ctx, url, matchDownloadCommandInput);

		console.info("[/download] Completed", {
			userId: ctx.from.id,
			chatId: ctx.chat.id,
			messageId: ctx.message.message_id,
			url,
			sent,
		});
		return true;
	});
