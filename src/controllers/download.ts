import { Composer } from "grammy";

import {
	extractMessageText,
	extractUrlsFromMessage,
} from "../services/context-message.ts";
import { matchDownloadCommandInput } from "../services/sources.ts";
import {
	downloadMatchedUrl,
	downloadPlainMatchedUrl,
} from "../services/url-download.ts";
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

type DownloadCommand = "download" | "plain";

async function handleDownloadCommand(
	ctx: CustomContext,
	next: () => Promise<void>,
	command: DownloadCommand,
) {
	if (!ctx.message || !ctx.from || !ctx.chat) {
		await next();
		return;
	}

	const urlSource = getCommandUrlSource(ctx);
	if (!urlSource) {
		console.info(`[/${command}] No URL found in command or reply`, {
			userId: ctx.from.id,
			chatId: ctx.chat.id,
			messageId: ctx.message.message_id,
		});
		await next();
		return;
	}

	console.info(`[/${command}] Processing URL`, {
		userId: ctx.from.id,
		chatId: ctx.chat.id,
		messageId: ctx.message.message_id,
		url: urlSource.url,
	});

	const sent =
		command === "plain"
			? await downloadPlainMatchedUrl(
					ctx,
					urlSource.url,
					matchDownloadCommandInput,
				)
			: await downloadMatchedUrl(
					ctx,
					urlSource.url,
					matchDownloadCommandInput,
					urlSource.sourceMessage,
				);

	console.info(`[/${command}] Completed`, {
		userId: ctx.from.id,
		chatId: ctx.chat.id,
		messageId: ctx.message.message_id,
		url: urlSource.url,
		sent,
	});
	return true;
}

const downloadCommands = downloadController.chatType([
	"supergroup",
	"private",
	"group",
]);

downloadCommands.command("download", (ctx, next) =>
	handleDownloadCommand(ctx, next, "download"),
);
downloadCommands.command("plain", (ctx, next) =>
	handleDownloadCommand(ctx, next, "plain"),
);
