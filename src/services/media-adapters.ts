import { type Api, InputFile } from "grammy";

import { deleteFile } from "../helpers/fs.js";
import type { CustomContext } from "../types/context.js";
import { downloadMedia } from "./yt-dlp.js";

export type MediaSource = {
	type: "tiktok" | "instagram" | "facebook" | "youtube" | "twitter";
	match: string | RegExp;
};

export type MediaAdapterData = {
	source: MediaSource;
	userId: number;
	userName: string;
	url: string;
	proxyUrl?: string;
	replyId?: number;
	threadId?: number;
};

export type MediaAdapterResult = {
	cleanup: () => Promise<void>;
	caption: string;
	rawCaption: string;
	error: string | null;
	extra: Parameters<Api["sendMessage"]>[2];
} & (
	| {
			kind: "video";
			file: InputFile;
	  }
	| {
			kind: "text";
			file: null;
	  }
);

export type MediaAdapter = (
	ctx: CustomContext,
	data: MediaAdapterData,
) => Promise<MediaAdapterResult>;

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

export const downloadAdapter: MediaAdapter = async (ctx, data) => {
	const caption = ctx.i18n.t("promoCaption", {
		viewUrl: ctx.i18n.t(`viewOn.${data.source.type}`, {
			postUrl: data.url,
			userName: data.userName,
			userId: data.userId,
		}),
	});

	const extra = (url: string) => ({
		parse_mode: "HTML" as const,
		...buildReplyExtra(data.replyId, data.threadId),
		link_preview_options: {
			is_disabled: false,
			url,
			prefer_large_media: true,
			show_above_text: true,
		},
	});

	const filepath = `/tmp/ummrobot-${Date.now()}-${data.userId}.mp4`;

	const video = (filename: string) =>
		({
			kind: "video",
			file: new InputFile(filename),
			error: null,
			caption,
			rawCaption: ctx.i18n.t("rawCaption", {
				type: data.source.type,
				kind: "video",
			}),
			extra: extra(data.url),
			cleanup: async () => await deleteFile(filename),
		}) as MediaAdapterResult;

	const trimError = (error: string) => error.split("ERROR: ")[1] ?? error;

	const errorText = (error: Error) =>
		({
			kind: "text",
			file: null,
			error: trimError(error.message),
			caption: ctx.i18n.t("errorViewOn", {
				viewOn: caption,
				error: trimError(error.message),
			}),
			rawCaption: ctx.i18n.t("rawErrorCaption", {
				type: data.source.type,
				kind: "link",
				error: trimError(error.message),
			}),
			extra: extra(data.proxyUrl ?? data.url),
			cleanup: async () => {},
		}) as MediaAdapterResult;

	let filename: string | null = null;
	try {
		filename = await downloadMedia(ctx.binary, data.url, filepath);
		return video(filename);
	} catch (directError) {
		if (data.proxyUrl) {
			try {
				filename = await downloadMedia(ctx.binary, data.proxyUrl, filepath);
				return video(filename);
			} catch (error) {
				return errorText(error as Error);
			}
		}
		return errorText(directError as Error);
	}
};
