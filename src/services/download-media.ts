import { InputFile } from "grammy";

import { type DownloadMediaFile, downloadMedia } from "./cobalt.ts";

export type DownloadedImage = DownloadMediaFile & {
	path?: string;
};

export type DownloadedMediaGroupItem = {
	file: InputFile;
	media: DownloadMediaFile;
	kind: "image" | "video";
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
			files: DownloadedMediaGroupItem[];
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
			const files = cobaltMedia.files
				.filter(
					(
						file,
					): file is DownloadMediaFile & { mediaKind: "image" | "video" } =>
						file.mediaKind === "image" || file.mediaKind === "video",
				)
				.map((file) => ({
					kind: file.mediaKind,
					file: new InputFile(file.data, file.filename),
					media: file,
				}));

			if (files.length === 0) {
				return null;
			}

			if (files.length === 1) {
				const [item] = files;
				return {
					kind: item.kind,
					bytes: item.media.data,
					extension: item.media.extension,
					file: item.file,
					filename: item.media.filename,
				};
			}

			return {
				kind: "images",
				files,
				images: files
					.filter((item) => item.kind === "image")
					.map((item) => item.media),
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
