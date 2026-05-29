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

function getMentionedReplyUrlSource(ctx: CustomContext) {
	const message = ctx.msg;
	if (!message) {
		return null;
	}

	if (!ctx.guestMessage && !isBotMentioned(message, ctx.me.username)) {
		return null;
	}

	const repliedUrl = message.reply_to_message
		? (extractUrlsFromMessage(message.reply_to_message)[0] ??
			extractMessageText(message.reply_to_message))
		: null;

	if (repliedUrl || !ctx.guestMessage) {
		return repliedUrl
			? { url: repliedUrl, sourceMessage: message.reply_to_message }
			: null;
	}

	const messageUrl =
		extractUrlsFromMessage(message)[0] ?? extractMessageText(message);
	return messageUrl ? { url: messageUrl, sourceMessage: message } : null;
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
			if (!ctx.from || !ctx.chat || !ctx.msg) {
				console.warn(
					"[MentionDownload] Missing context fields",
					getLogContext(ctx),
				);
				await next();
				return;
			}

			if (!ctx.guestMessage && !ctx.msg.reply_to_message) {
				await next();
				return;
			}

			if (!ctx.guestMessage && !isBotMentioned(ctx.msg, ctx.me.username)) {
				await next();
				return;
			}

			const urlSource = getMentionedReplyUrlSource(ctx);
			if (!urlSource) {
				console.info("[MentionDownload] No URL found in context message", {
					...getLogContext(ctx),
					repliedText:
						ctx.msg.reply_to_message?.text ??
						ctx.msg.reply_to_message?.caption ??
						null,
					triggerText: ctx.msg.text ?? ctx.msg.caption ?? null,
				});
				await next();
				return;
			}

			console.info("[MentionDownload] Processing context URL", {
				...getLogContext(ctx),
				url: urlSource.url,
			});

			const sent = await downloadMatchedUrl(
				ctx,
				urlSource.url,
				matchDownloadCommandInput,
				urlSource.sourceMessage,
			);
			if (!sent) {
				console.info("[MentionDownload] Matched flow did not send a response", {
					...getLogContext(ctx),
					url: urlSource.url,
				});
				await next();
				return;
			}

			console.info("[MentionDownload] Completed", {
				...getLogContext(ctx),
				url: urlSource.url,
			});
		},
	);
