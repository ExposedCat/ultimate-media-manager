import { InputFile } from "grammy";

import type { PostCaptionMeta } from "./caption.ts";
import type { DownloadMediaFile, DownloadMediaResult } from "./media.ts";
import { downloadWithPostfetch } from "./postfetch.ts";
import { downloadWithYtdlp } from "./ytdlp.ts";

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
			duration?: number;
			height?: number;
			title?: string;
			metadata?: PostCaptionMeta;
			thumbnail?: Uint8Array;
			width?: number;
	  }
	| {
			kind: "images";
			files: DownloadedMediaGroupItem[];
			metadata?: PostCaptionMeta;
	  };

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
				duration: item.media.duration,
				height: item.media.height,
				metadata: result.metadata,
				thumbnail: item.media.thumbnail,
				width: item.media.width,
			};
		}

		return {
			kind: "images",
			files,
			metadata: result.metadata,
		};
	}

	return {
		kind: result.mediaKind,
		bytes: result.file.data,
		extension: result.extension,
		file: new InputFile(result.file.data, result.file.filename),
		filename: result.file.filename,
		duration: result.file.duration,
		height: result.file.height,
		metadata: result.metadata,
		thumbnail: result.file.thumbnail,
		width: result.file.width,
	};
}
