import { type Api, InputFile } from "grammy";

import { deletePaths } from "../helpers/fs.ts";
import type { CustomContext } from "../types/context.ts";
import { downloadMedia } from "./cobalt.ts";
import {
	downloadYoutubeVideo,
	prepareYoutubeVideo,
} from "./youtube-video-download.ts";

const MAX_VIDEO_SIZE_MB = 300;

export type MediaSource = {
	type:
		| "tiktok"
		| "instagram"
		| "facebook"
		| "youtube"
		| "twitter"
		| "pinterest"
		| "soundcloud"
		| "reddit"
		| "youtubeVideo";
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
	cleanup: () => Promise<unknown>;
	caption: string;
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
	console.info("[Cobalt] Starting download adapter", {
		sourceType: data.source.type,
		url: data.url,
		userId: data.userId,
	});

	const caption = (kind: string) =>
		ctx.i18n.t("promoCaption", {
			viewUrl: ctx.i18n.t(`viewOn.${data.source.type}`, {
				kind,
				postUrl: data.url,
				userName: data.userName,
				userId: data.userId,
			}),
		});

	const baseExtra = (url: string) => ({
		...buildReplyExtra(data.replyId, data.threadId),
		link_preview_options: {
			is_disabled: false,
			url,
			prefer_large_media: true,
			show_above_text: true,
		},
	});

	const htmlExtra = (url: string) => ({
		parse_mode: "HTML" as const,
		...baseExtra(url),
	});

	const tempDir = await Deno.makeTempDir({
		prefix: `ummrobot-${data.userId}-`,
	});

	const images = (filenames: string[]) =>
		({
			kind: "images",
			files: filenames.map((filename) => new InputFile(filename)),
			error: null,
			caption: caption("slider"),
			extra: htmlExtra(data.url),
			cleanup: async () => await deletePaths([tempDir]),
		}) as MediaAdapterResult;

	const image = (filename: string) =>
		({
			kind: "image",
			file: new InputFile(filename),
			error: null,
			caption: caption("image"),
			extra: htmlExtra(data.url),
			cleanup: async () => await deletePaths([tempDir]),
		}) as MediaAdapterResult;

	const video = (filename: string) =>
		({
			kind: "video",
			file: new InputFile(filename),
			error: null,
			caption: caption("video"),
			extra: htmlExtra(data.url),
			cleanup: async () => await deletePaths([tempDir]),
		}) as MediaAdapterResult;

	const audio = (filename: string) =>
		({
			kind: "audio",
			file: new InputFile(filename),
			error: null,
			caption: caption("audio"),
			extra: htmlExtra(data.url),
			cleanup: async () => await deletePaths([tempDir]),
		}) as MediaAdapterResult;

	const preview = () =>
		({
			kind: "text",
			file: null,
			error: null,
			caption: caption("post"),
			extra: htmlExtra(data.proxyUrl ?? data.url),
			cleanup: async () => await deletePaths([tempDir]),
		}) as MediaAdapterResult;

	const media = await downloadMedia(data.url, tempDir);
	if (media) {
		console.info("[Cobalt] Downloaded media", {
			sourceType: data.source.type,
			url: data.url,
			userId: data.userId,
			mediaType: media.type,
			mediaKind: media.type === "single" ? media.mediaKind : "multiple",
		});

		if (media.type === "single" && media.filename) {
			const func = { audio, image, video }[media.mediaKind];
			return func(media.filename);
		}

		if (media.type === "multiple") {
			return images(media.filenames);
		}
	}

	console.info("[Cobalt] Falling back to preview", {
		sourceType: data.source.type,
		url: data.url,
		userId: data.userId,
	});
	return preview();
};

export const youtubeVideoDownloadAdapter: MediaAdapter = async (ctx, data) => {
	console.info("[YouTube] Starting yt-dlp adapter", {
		url: data.url,
		userId: data.userId,
	});

	const tempDir = await Deno.makeTempDir({
		prefix: `ummrobot-${data.userId}-`,
	});

	const cleanup = async () => await deletePaths([tempDir]);
	const extra = {
		parse_mode: "HTML" as const,
		...buildReplyExtra(data.replyId, data.threadId),
	};
	const text = (caption: string) =>
		({
			kind: "text",
			file: null,
			error: null,
			caption,
			extra,
			cleanup,
		}) as MediaAdapterResult;

	try {
		const downloadId = `${Date.now()}-${data.userId}`;
		const prepared = await prepareYoutubeVideo(data.url, downloadId);
		if (!prepared) {
			console.warn("[YouTube] Failed to prepare video", {
				url: data.url,
				userId: data.userId,
			});
			return text(ctx.i18n.t("error.video"));
		}

		if (prepared.sizeMb > MAX_VIDEO_SIZE_MB) {
			console.warn("[YouTube] Video exceeds size limit", {
				url: data.url,
				userId: data.userId,
				sizeMb: prepared.sizeMb,
				limitMb: MAX_VIDEO_SIZE_MB,
			});
			return text(
				ctx.i18n.t("error.videoSize", {
					size: prepared.sizeMb.toFixed(1),
					limit: MAX_VIDEO_SIZE_MB,
				}),
			);
		}

		const video = await downloadYoutubeVideo(prepared, tempDir);
		console.info("[YouTube] Downloaded video", {
			url: data.url,
			userId: data.userId,
			title: prepared.title,
			extension: prepared.extension,
			sizeMb: prepared.sizeMb,
		});

		return {
			kind: "video",
			file: new InputFile(video, `${prepared.title}.${prepared.extension}`),
			error: null,
			caption: ctx.i18n.t("downloaded.video", {
				title: prepared.title,
				url: data.url,
			}),
			extra,
			cleanup,
		};
	} catch (error) {
		console.error("[Failed to download YouTube video]", {
			url: data.url,
			userId: data.userId,
			error,
		});
		return text(ctx.i18n.t("error.video"));
	}
};
