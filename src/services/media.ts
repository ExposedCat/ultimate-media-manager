import type { PostCaptionMeta } from "./caption.ts";

export type DownloadMediaResult =
	| {
			type: "single";
			file: DownloadMediaFile;
			mediaKind: "image" | "video" | "audio";
			extension: string;
			metadata?: PostCaptionMeta;
	  }
	| {
			type: "multiple";
			files: DownloadMediaFile[];
			mediaKind: "mixed";
			metadata?: PostCaptionMeta;
	  }
	| {
			type: "text";
			metadata?: PostCaptionMeta;
	  };

export type DownloadMediaFile = {
	contentType?: string;
	data: Uint8Array;
	extension: string;
	filename: string;
	duration?: number;
	height?: number;
	mediaKind: "image" | "video" | "audio";
	thumbnail?: Uint8Array;
	width?: number;
};

export function bundle(files: DownloadMediaFile[]): DownloadMediaResult | null {
	if (files.length === 0) {
		return null;
	}
	if (files.length > 1) {
		return { type: "multiple", files, mediaKind: "mixed" };
	}
	const [file] = files;
	return {
		type: "single",
		file,
		mediaKind: file.mediaKind,
		extension: file.extension,
	};
}
