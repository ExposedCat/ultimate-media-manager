import { InputFile } from "grammy";

import { type DownloadMediaFile, downloadMedia } from "./cobalt.ts";

export type DownloadedImage = DownloadMediaFile & {
	path?: string;
};

export type DownloadedMedia =
	| {
			kind: "image" | "video" | "audio";
			file: InputFile;
			bytes?: Uint8Array;
			extension?: string;
			filename?: string;
			title?: string;
	  }
	| {
			kind: "images";
			files: InputFile[];
			images: DownloadedImage[];
	  };

function sanitizeFilename(filename: string) {
	return filename.replaceAll("/", "_").replaceAll("\\", "_");
}

export async function materializeImageFiles(
	media: Extract<DownloadedMedia, { kind: "images" }>,
	tempDir: string,
) {
	const filenames: string[] = [];
	for (const [index, image] of media.images.entries()) {
		if (!image.path) {
			const filename = `${tempDir}/${index}-${sanitizeFilename(
				image.filename || `image.${image.extension || "jpg"}`,
			)}`;
			await Deno.writeFile(filename, image.data);
			image.path = filename;
		}

		filenames.push(image.path);
	}

	return filenames;
}

export async function downloadMediaForUrl(
	url: string,
): Promise<DownloadedMedia | null> {
	const cobaltMedia = await downloadMedia(url);
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
				files: cobaltMedia.files.map(
					(file) => new InputFile(file.data, file.filename),
				),
				images: cobaltMedia.files,
			};
		}

		return {
			kind: cobaltMedia.mediaKind,
			bytes: cobaltMedia.file.data,
			extension: cobaltMedia.extension,
			file: new InputFile(cobaltMedia.file.data, cobaltMedia.file.filename),
			filename: cobaltMedia.file.filename,
		};
	}

	console.info("[DownloadMedia] Cobalt failed to download media", { url });
	return null;
}
