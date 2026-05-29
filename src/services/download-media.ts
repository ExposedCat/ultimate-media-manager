import { InputFile } from "grammy";

import { downloadMedia } from "./cobalt.ts";

export type DownloadedMedia =
	| {
			kind: "image" | "video" | "audio";
			file: InputFile;
			extension?: string;
			publicUrl?: string;
			title?: string;
	  }
	| {
			kind: "images";
			filenames: string[];
			files: InputFile[];
			publicUrls?: string[];
	  };

export async function downloadMediaForUrl(
	url: string,
	tempDir: string,
): Promise<DownloadedMedia | null> {
	const cobaltMedia = await downloadMedia(url, tempDir);
	if (cobaltMedia) {
		console.info("[DownloadMedia] Downloaded media with Cobalt", {
			url,
			mediaType: cobaltMedia.type,
			mediaKind:
				cobaltMedia.type === "single" ? cobaltMedia.mediaKind : "multiple",
		});

		if (cobaltMedia.type === "multiple") {
			return {
				kind: "images",
				filenames: cobaltMedia.filenames,
				files: cobaltMedia.filenames.map((filename) => new InputFile(filename)),
				publicUrls: cobaltMedia.publicUrls,
			};
		}

		if (cobaltMedia.filename) {
			return {
				kind: cobaltMedia.mediaKind,
				extension: cobaltMedia.extension,
				file: new InputFile(cobaltMedia.filename),
				publicUrl: cobaltMedia.publicUrl,
			};
		}
	}

	console.info("[DownloadMedia] Cobalt failed to download media", { url });
	return null;
}
