import { InputFile } from "grammy";

import type { PostCaptionMeta } from "./caption.ts";
import type { DownloadMediaFile, DownloadMediaResult } from "./media.ts";
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
			metadata?: PostCaptionMeta;
	  }
	| {
			kind: "images";
			files: DownloadedMediaGroupItem[];
			images: DownloadedImage[];
			metadata?: PostCaptionMeta;
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

// Reads the typed unavailability cause that @postfetch/core attaches to its
// errors; absent on resolvers (or older library versions) that do not set it.
function postfetchReason(error: unknown): string | undefined {
	if (error instanceof Error && "reason" in error) {
		const value = (error as { reason?: unknown }).reason;
		return typeof value === "string" ? value : undefined;
	}
	return undefined;
}

export async function downloadMediaForUrl(url: string): Promise<{
	media: DownloadedMedia | null;
	error?: string;
	reason?: string;
	metadata?: PostCaptionMeta;
}> {
	let error: string | undefined;
	let reason: string | undefined;
	for (const resolver of [downloadWithPostfetch, downloadWithYtdlp]) {
		let result: DownloadMediaResult | null;
		try {
			result = await resolver(url);
		} catch (caught) {
			error ??= caught instanceof Error ? caught.message : String(caught);
			reason ??= postfetchReason(caught);
			continue;
		}
		if (!result) {
			continue;
		}
		if (result.type === "text") {
			console.info("[DownloadMedia] Resolved a text post", { url });
			return { media: null, metadata: result.metadata };
		}
		console.info("[DownloadMedia] Downloaded media", {
			url,
			mediaType: result.type,
			mediaKind: result.type === "single" ? result.mediaKind : "multiple",
		});
		const media = toDownloadedMedia(result);
		if (media) {
			return { media };
		}
	}

	console.info("[DownloadMedia] No resolver could download media", { url });
	return { media: null, error, reason };
}

function toDownloadedMedia(
	result: Exclude<DownloadMediaResult, { type: "text" }>,
): DownloadedMedia | null {
	if (result.type === "multiple") {
		const files = result.files
			.filter(
				(file): file is DownloadMediaFile & { mediaKind: "image" | "video" } =>
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
				metadata: result.metadata,
			};
		}

		return {
			kind: "images",
			files,
			images: files
				.filter((item) => item.kind === "image")
				.map((item) => item.media),
			metadata: result.metadata,
		};
	}

	return {
		kind: result.mediaKind,
		bytes: result.file.data,
		extension: result.extension,
		file: new InputFile(result.file.data, result.file.filename),
		filename: result.file.filename,
		metadata: result.metadata,
	};
}
