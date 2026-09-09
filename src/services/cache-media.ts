import { APP_ENV } from "../config/env.ts";
import type { CustomContext } from "../types/context.ts";
import type { DownloadedMedia } from "./download-media.ts";
import {
	type CachedMedia,
	getCachedMedia,
	getCachedMediaFromRichMessage,
	setCachedMedia,
} from "./media-file-cache.ts";
import { prepareDownloadedRichMedia } from "./rich-media-upload.ts";
import { buildRichMessage } from "./rich-message.ts";
import { responseSlideshowDelay } from "./slideshow.ts";

export async function cacheDownloadedMedia(
	ctx: CustomContext,
	media: DownloadedMedia,
	sourceUrl?: string,
): Promise<CachedMedia | null> {
	const delay = responseSlideshowDelay(ctx);
	if (sourceUrl) {
		const cachedMedia = getCachedMedia(sourceUrl, delay);
		if (cachedMedia) {
			return cachedMedia;
		}
	}

	const richMedia = await prepareDownloadedRichMedia(media);
	const sentMessage = await ctx.api.sendRichMessage(
		Number(APP_ENV.CACHE_CHAT_ID),
		buildRichMessage({
			baseHtml: "",
			captionEnabled: false,
			media: richMedia,
			sourceType: "facebook",
		}),
	);
	const cachedMedia = getCachedMediaFromRichMessage(sentMessage);
	if (!cachedMedia) {
		return null;
	}

	const cachedWithMetadata = {
		...cachedMedia,
		metadata: media.metadata,
	};
	if (sourceUrl) {
		setCachedMedia(sourceUrl, cachedWithMetadata, delay);
	}
	return cachedWithMetadata;
}
