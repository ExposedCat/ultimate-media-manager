import type { DownloadedMedia } from "./download-media.ts";
import type { RichMediaItem } from "./rich-message.ts";

export function prepareDownloadedRichMedia(
	media: DownloadedMedia,
): RichMediaItem[] {
	if (media.kind === "images") {
		return media.files.map((item) => ({
			kind: item.kind,
			media: item.file,
		}));
	}

	return [{ kind: media.kind, media: media.file }];
}
