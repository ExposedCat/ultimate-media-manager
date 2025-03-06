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
	replyId?: number;
	threadId?: number;
};

export type MediaAdapter = (
	ctx: CustomContext,
	data: MediaAdapterData,
) => Promise<
	{
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
	)
>;

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

export const ddInstagramAdapter: MediaAdapter = async (ctx, data) => ({
	kind: "text",
	caption: ctx.i18n.t("promoCaption", {
		viewUrl: ctx.i18n.t("viewOn.instagram", {
			postUrl: data.url,
			userName: data.userName,
			userId: data.userId,
		}),
	}),
	rawCaption: ctx.i18n.t("rawCaption", {
		type: "instagram",
		kind: "link",
	}),
	extra: {
		link_preview_options: {
			is_disabled: false,
			url: data.url.replace("instagram", "ddinstagram"),
			prefer_large_media: true,
			show_above_text: true,
		},
		...buildReplyExtra(data.replyId, data.threadId),
	},
	file: null,
	error: null,
	cleanup: async () => {},
});

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

	const filepath = `/tmp/ummrobot-${Date.now()}-${data.userId}.mp4`;
	try {
		const filename = await downloadMedia(ctx.binary, data.url, filepath);
		return {
			kind: "video",
			file: new InputFile(filename),
			error: null,
			caption,
			rawCaption: ctx.i18n.t("rawCaption", {
				type: data.source.type,
				kind: "video",
			}),
			extra,
			cleanup: async () => await deleteFile(filename),
		};
	} catch (error) {
		return {
			kind: "text",
			file: null,
			error: (error as Error).message,
			caption,
			rawCaption: ctx.i18n.t("rawCaption", {
				type: data.source.type,
				kind: "link",
			}),
			extra,
			cleanup: async () => {},
		};
	}
};
