import { Composer } from "grammy";

import {
	extractMessageText,
	extractUrlsFromMessage,
	isBotMentioned,
} from "../services/context-message.ts";
import { matchDownloadCommandInput } from "../services/sources.ts";
import { downloadMatchedUrl } from "../services/url-download.ts";
import type { CustomContext } from "../types/context.ts";

function getLogContext(ctx: CustomContext) {
	return {
		userId: ctx.from?.id,
		chatId: ctx.chat?.id,
		messageId: ctx.msg?.message_id,
		isGuestMessage: Boolean(ctx.guestMessage),
		hasReply: Boolean(ctx.msg?.reply_to_message),
	};
}

function getMentionedReplyUrl(ctx: CustomContext) {
	const message = ctx.msg;
	if (!message?.reply_to_message) {
		return null;
	}

	if (!ctx.guestMessage && !isBotMentioned(message, ctx.me.username)) {
		return null;
	}

	return (
		extractUrlsFromMessage(message.reply_to_message)[0] ??
		extractMessageText(message.reply_to_message)
	);
}

export const contextMessageController = new Composer<CustomContext>();

contextMessageController
	.chatType(["supergroup", "private", "group"])
	.on(
		[
			"message:text",
			"message:caption",
			"guest_message:text",
			"guest_message:caption",
		],
		async (ctx, next) => {
			console.info("[MentionDownload] Received candidate message", {
				...getLogContext(ctx),
				text: ctx.msg?.text ?? ctx.msg?.caption ?? null,
			});

			if (!ctx.from || !ctx.chat || !ctx.msg) {
				console.warn(
					"[MentionDownload] Missing context fields",
					getLogContext(ctx),
				);
				await next();
				return;
			}

			if (!ctx.msg.reply_to_message) {
				console.info(
					"[MentionDownload] Skipping non-reply message",
					getLogContext(ctx),
				);
				await next();
				return;
			}

			if (!ctx.guestMessage && !isBotMentioned(ctx.msg, ctx.me.username)) {
				console.info("[MentionDownload] Skipping reply without bot mention", {
					...getLogContext(ctx),
					botUsername: ctx.me.username,
				});
				await next();
				return;
			}

			const url = getMentionedReplyUrl(ctx);
			if (!url) {
				console.info("[MentionDownload] No URL found in replied message", {
					...getLogContext(ctx),
					repliedText:
						ctx.msg.reply_to_message.text ??
						ctx.msg.reply_to_message.caption ??
						null,
				});
				await next();
				return;
			}

			console.info("[MentionDownload] Processing replied URL", {
				...getLogContext(ctx),
				url,
			});

			const sent = await downloadMatchedUrl(
				ctx,
				url,
				matchDownloadCommandInput,
			);
			if (!sent) {
				console.info("[MentionDownload] Matched flow did not send a response", {
					...getLogContext(ctx),
					url,
				});
				await next();
				return;
			}

			console.info("[MentionDownload] Completed", {
				...getLogContext(ctx),
				url,
			});
		},
	);
