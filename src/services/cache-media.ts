import { APP_ENV } from "../config/env.ts";
import type { CustomContext } from "../types/context.ts";
import type { DownloadedMedia } from "./download-media.ts";
import {
	type CachedMedia,
	getCachedMedia,
	getCachedMediaFromRichMessage,
	setCachedMedia,
} from "./media-file-cache.ts";
import { buildRichMessage } from "./rich-message.ts";

export async function cacheDownloadedMedia(
	ctx: CustomContext,
	media: DownloadedMedia,
	sourceUrl?: string,
): Promise<CachedMedia | null> {
	if (sourceUrl) {
		const cachedMedia = getCachedMedia(sourceUrl);
		if (cachedMedia) {
			return cachedMedia;
		}
	}

	const sentMessage = await ctx.api.sendRichMessage(
		Number(APP_ENV.CACHE_CHAT_ID),
		buildRichMessage({
			baseHtml: "",
			captionEnabled: false,
			media:
				media.kind === "images"
					? media.files.map((item) => ({
							kind: item.kind,
							media: item.file,
						}))
					: [{ kind: media.kind, media: media.file }],
			sourceType: "facebook",
		}),
	);
	const cachedMedia = getCachedMediaFromRichMessage(sentMessage);
	if (cachedMedia && sourceUrl) {
		setCachedMedia(sourceUrl, {
			...cachedMedia,
			metadata: media.metadata,
		});
	}
	return cachedMedia;
}
