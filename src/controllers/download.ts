import { Composer } from "grammy";

import { matchDownloadCommandInput } from "../services/sources.ts";
import {
	downloadMatchedUrl,
	extractUrlsFromMessage,
} from "../services/url-download.ts";
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
		repliedMessage?.text?.trim() ??
		repliedMessage?.caption?.trim() ??
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
			await next();
			return;
		}

		await downloadMatchedUrl(ctx, url, matchDownloadCommandInput);
		return true;
	});
