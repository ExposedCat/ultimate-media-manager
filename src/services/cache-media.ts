import { APP_ENV } from "../config/env.ts";
import type { CustomContext } from "../types/context.ts";
import type { DownloadedMedia } from "./download-media.ts";
import {
	type CachedMedia as CachedFileMedia,
	getCachedMedia,
	setCachedMedia,
} from "./media-file-cache.ts";

export type CachedMedia =
	| {
			type: "photo";
			fileId: string;
	  }
	| {
			type: "audio";
			fileId: string;
	  }
	| {
			type: "video";
			fileId: string;
	  };

function toCacheChatMedia(media: CachedFileMedia): CachedMedia | null {
	if (media.kind === "image") {
		return { type: "photo", fileId: media.fileId };
	}

	if (media.kind === "images") {
		const item = media.items[0];
		if (!item) {
			return null;
		}

		return {
			type: item.kind === "image" ? "photo" : "video",
			fileId: item.fileId,
		};
	}

	return { type: media.kind, fileId: media.fileId };
}

function toCachedFileMedia(media: CachedMedia): CachedFileMedia {
	return {
		kind: media.type === "photo" ? "image" : media.type,
		fileId: media.fileId,
	};
}

export async function cacheDownloadedMedia(
	ctx: CustomContext,
	media: DownloadedMedia,
	sourceUrl?: string,
): Promise<CachedMedia | null> {
	if (sourceUrl) {
		const cachedMedia = getCachedMedia(sourceUrl);
		if (cachedMedia) {
			const cachedChatMedia = toCacheChatMedia(cachedMedia);
			if (cachedChatMedia) {
				return cachedChatMedia;
			}
		}
	}

	const method =
		media.kind === "video"
			? "sendVideo"
			: media.kind === "audio"
				? "sendAudio"
				: media.kind === "images"
					? media.files[0]?.kind === "video"
						? "sendVideo"
						: "sendPhoto"
					: "sendPhoto";

	const mediaFile = media.kind === "images" ? media.files[0]?.file : media.file;
	if (!mediaFile) {
		return null;
	}

	const sentMedia = await ctx.api[method](
		Number(APP_ENV.CACHE_CHAT_ID),
		mediaFile,
	);
	if ("video" in sentMedia) {
		const cachedMedia = {
			type: "video",
			fileId: sentMedia.video.file_id,
		} as const;
		if (sourceUrl) {
			setCachedMedia(sourceUrl, toCachedFileMedia(cachedMedia));
		}
		return cachedMedia;
	}

	if ("audio" in sentMedia) {
		const cachedMedia = {
			type: "audio",
			fileId: sentMedia.audio.file_id,
		} as const;
		if (sourceUrl) {
			setCachedMedia(sourceUrl, toCachedFileMedia(cachedMedia));
		}
		return cachedMedia;
	}

	if ("photo" in sentMedia) {
		const fileId = sentMedia.photo.at(-1)?.file_id;
		if (!fileId) {
			return null;
		}

		const cachedMedia = {
			type: "photo",
			fileId,
		} as const;
		if (sourceUrl) {
			setCachedMedia(sourceUrl, toCachedFileMedia(cachedMedia));
		}
		return cachedMedia;
	}

	return null;
}
