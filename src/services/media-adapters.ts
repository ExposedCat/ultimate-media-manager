import { InputFile } from "grammy";

import { deleteFile } from "../helpers/fs.js";
import type { CustomContext } from "../types/context.js";
import { downloadMedia } from "./yt-dlp.js";

export type MediaSource = {
	type: "tiktok" | "instagram" | "facebook" | "youtube";
	match: string | RegExp;
};

export type MediaAdapterData = {
	source: MediaSource;
	userId: number;
	userName: string;
	url: string;
	replyId?: number;
	threadId?: number;
};

export type MediaAdapter = (
	ctx: CustomContext,
	data: MediaAdapterData,
) => Promise<boolean>;

export const buildReplyExtra = (
	replyId: number | null | undefined,
	threadId: number | null | undefined,
) => ({
	...(threadId && { message_thread_id: threadId }),
	...(replyId && {
		reply_parameters: {
			message_id: replyId,
			allow_sending_without_reply: true,
		},
	}),
});

export const ddInstagramAdapter: MediaAdapter = async (ctx, data) => {
	await ctx.text(
		"promoCaption",
		{
			viewUrl: ctx.i18n.t("viewOn.instagram", {
				postUrl: data.url,
				userName: data.userName,
				userId: data.userId,
			}),
		},
		{
			link_preview_options: {
				is_disabled: false,
				url: data.url.replace("instagram", "ddinstagram"),
				prefer_large_media: true,
				show_above_text: true,
			},
			...buildReplyExtra(data.replyId, data.threadId),
		},
	);
	return true;
};

export const downloadAdapter: MediaAdapter = async (ctx, data) => {
	const caption = ctx.i18n.t("promoCaption", {
		viewUrl: ctx.i18n.t(`viewOn.${data.source.type}`, {
			postUrl: data.url,
			userName: data.userName,
			userId: data.userId,
		}),
	});
	const extra = {
		parse_mode: "HTML" as const,
		...buildReplyExtra(data.replyId, data.threadId),
		link_preview_options: {
			is_disabled: false,
			url: data.url,
			prefer_large_media: true,
			show_above_text: true,
		},
	};

	const logError = (error: Error, source: string) =>
		console.error("[Download Adapter] Failed to respond with video", {
			source,
			error,
		});

	const filepath = `/tmp/ummrobot-${Date.now()}-${data.userId}.mp4`;
	try {
		let filename: string;
		try {
			filename = await downloadMedia(ctx.binary, data.url, filepath);
			await ctx.replyWithVideo(new InputFile(filename), { caption, ...extra });
		} catch {
			await ctx.reply(caption, extra);
			return true;
		}
		await deleteFile(filename);
		return true;
	} catch (error) {
		logError(error as Error, filepath);
	}

	return false;
};
