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
	mediaKind: "image" | "video" | "audio";
};

const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "gif"];
const AUDIO_EXTENSIONS = ["mp3", "wav", "ogg", "m4a"];

export function mediaKindForExtension(
	extension: string,
): "image" | "video" | "audio" {
	if (IMAGE_EXTENSIONS.includes(extension)) {
		return "image";
	}
	if (AUDIO_EXTENSIONS.includes(extension)) {
		return "audio";
	}
	return "video";
}

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
