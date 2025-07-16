import { type Api, InputFile } from "grammy";

import { deleteFile } from "../helpers/fs.js";
import type { CustomContext } from "../types/context.js";
import { downloadMedia } from "./cobalt.js";

export type MediaSource = {
	type:
		| "tiktok"
		| "instagram"
		| "facebook"
		| "youtube"
		| "twitter"
		| "pinterest"
		| "soundcloud"
		| "reddit";
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
			kind: "video" | "image" | "audio";
			file: InputFile;
	  }
	| {
			kind: "images";
			files: InputFile[];
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
	const caption = (kind: string) =>
		ctx.i18n.t("promoCaption", {
			viewUrl: ctx.i18n.t(`viewOn.${data.source.type}`, {
				kind,
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

	const pathPrefix = `/tmp/ummrobot-${Date.now()}-${data.userId}-`;

	const video = (filename: string) =>
		({
			kind: "video",
			file: new InputFile(filename),
			error: null,
			caption: caption("video"),
			rawCaption: ctx.i18n.t("rawCaption", {
				type: data.source.type,
				kind: "video",
			}),
			extra: extra(data.url),
			cleanup: async () => await deleteFile(filename),
		}) as MediaAdapterResult;

	const image = (filename: string) =>
		({
			kind: "image",
			file: new InputFile(filename),
			error: null,
			caption: caption("image"),
			rawCaption: ctx.i18n.t("rawCaption", {
				type: data.source.type,
				kind: "image",
			}),
			extra: extra(data.url),
			cleanup: async () => await deleteFile(filename),
		}) as MediaAdapterResult;

	const images = (filenames: string[]) =>
		({
			kind: "images",
			files: filenames.map((filename) => new InputFile(filename)),
			error: null,
			caption: caption("slider"),
			rawCaption: ctx.i18n.t("rawCaption", {
				type: data.source.type,
				kind: "image",
			}),
			extra: extra(data.url),
			cleanup: async () => await deleteFile(filenames[0]),
		}) as MediaAdapterResult;

	const audio = (filename: string) =>
		({
			kind: "audio",
			file: new InputFile(filename),
			error: null,
			caption: caption("audio"),
			rawCaption: ctx.i18n.t("rawCaption", {
				type: data.source.type,
				kind: "audio",
			}),
			extra: extra(data.url),
			cleanup: async () => await deleteFile(filename),
		}) as MediaAdapterResult;

	const text = () =>
		({
			kind: "text",
			file: null,
			error: null,
			caption: caption("post"),
			rawCaption: ctx.i18n.t("rawErrorCaption", {
				type: data.source.type,
				kind: "link",
				error: "",
			}),
			extra: extra(data.proxyUrl ?? data.url),
			cleanup: async () => {},
		}) as MediaAdapterResult;

	const media = await downloadMedia(data.url, pathPrefix);
	if (media) {
		// biome-ignore lint/style/noNonNullAssertion: always returns a string
		const filename = (
			media.type === "single" ? media.filename : media.filenames[0]
		)
			.split(".")
			.at(-1)!;
		const isImage = ["png", "jpg", "jpeg"].includes(filename);
		const isSound = ["mp3", "wav", "ogg"].includes(filename);
		if (media.type === "single") {
			return isImage
				? image(media.filename)
				: isSound
					? audio(media.filename)
					: video(media.filename);
		}
		return images(media.filenames);
	}

	return text();
};
