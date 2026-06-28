import { InputFile } from "grammy";

import type { DownloadMediaFile } from "./media.ts";
import { downloadWithPostfetch } from "./postfetch.ts";
import { downloadWithYtdlp } from "./ytdlp.ts";

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
	const media =
		(await downloadWithPostfetch(url)) ?? (await downloadWithYtdlp(url));
	if (media) {
		console.info("[DownloadMedia] Downloaded media", {
			url,
			mediaType: media.type,
			mediaKind: media.type === "single" ? media.mediaKind : "multiple",
		});

		if (media.type === "multiple") {
			const files = media.files
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
			kind: media.mediaKind,
			bytes: media.file.data,
			extension: media.extension,
			file: new InputFile(media.file.data, media.file.filename),
			filename: media.file.filename,
		};
	}

	console.info("[DownloadMedia] Media function failed to download media", {
		url,
	});
	return null;
}
