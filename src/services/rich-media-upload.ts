import { InputFile } from "grammy";

import type { DownloadedMedia } from "./download-media.ts";
import type { RichMediaItem } from "./rich-message.ts";

export async function prepareDownloadedRichMedia(
	media: DownloadedMedia,
): Promise<RichMediaItem[]> {
	if (media.kind === "images") {
		const items: RichMediaItem[] = [];
		for (const item of media.files) {
			items.push(prepareItem(item.kind, item.file, item.media));
		}
		return items;
	}

	return [prepareItem(media.kind, media.file, media)];
}

function prepareItem(
	kind: "image" | "video" | "audio",
	file: InputFile,
	video: {
		duration?: number;
		height?: number;
		thumbnail?: Uint8Array;
		width?: number;
	},
): RichMediaItem {
	if (kind !== "video") return { kind, media: file };
	return {
		kind,
		media: file,
		...(video.duration !== undefined && { duration: video.duration }),
		...(video.height !== undefined && { height: video.height }),
		...(video.thumbnail && {
			thumbnail: new InputFile(video.thumbnail, "thumbnail.jpg"),
		}),
		...(video.width !== undefined && { width: video.width }),
	};
}
