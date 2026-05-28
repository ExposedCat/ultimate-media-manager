import { APP_ENV } from "../config/env.ts";
import type { CustomContext } from "../types/context.ts";
import type { DownloadedMedia } from "./download-media.ts";

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

export async function cacheDownloadedMedia(
	ctx: CustomContext,
	media: DownloadedMedia,
): Promise<CachedMedia | null> {
	const method =
		media.kind === "video"
			? "sendVideo"
			: media.kind === "audio"
				? "sendAudio"
				: "sendPhoto";

	const mediaFile = media.kind === "images" ? media.files[0] : media.file;
	if (!mediaFile) {
		return null;
	}

	const sentMedia = await ctx.api[method](
		Number(APP_ENV.CACHE_CHAT_ID),
		mediaFile,
	);
	if ("video" in sentMedia) {
		return {
			type: "video",
			fileId: sentMedia.video.file_id,
		};
	}

	if ("audio" in sentMedia) {
		return {
			type: "audio",
			fileId: sentMedia.audio.file_id,
		};
	}

	if ("photo" in sentMedia) {
		const fileId = sentMedia.photo.at(-1)?.file_id;
		if (!fileId) {
			return null;
		}

		return {
			type: "photo",
			fileId,
		};
	}

	return null;
}
