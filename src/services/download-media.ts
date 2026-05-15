import { InputFile } from "grammy";

import { downloadMedia } from "./cobalt.ts";
import {
	downloadYoutubeVideo,
	downloadYtDlpMedia,
	prepareYoutubeVideo,
	prepareYtDlpMedia,
} from "./youtube-video-download.ts";

const MAX_VIDEO_SIZE_MB = 300;

export type DownloadedMedia =
	| {
			kind: "image" | "video" | "audio";
			file: InputFile;
			title?: string;
	  }
	| {
			kind: "images";
			files: InputFile[];
	  };

type DownloadMode = "generic" | "video";

export async function downloadMediaForUrl(
	url: string,
	tempDir: string,
	mode: DownloadMode = "generic",
): Promise<DownloadedMedia | null> {
	const cobaltMedia = await downloadMedia(url, tempDir);
	if (cobaltMedia) {
		console.info("[DownloadMedia] Downloaded media with Cobalt", {
			url,
			mode,
			mediaType: cobaltMedia.type,
			mediaKind:
				cobaltMedia.type === "single" ? cobaltMedia.mediaKind : "multiple",
		});

		if (cobaltMedia.type === "multiple") {
			return {
				kind: "images",
				files: cobaltMedia.filenames.map((filename) => new InputFile(filename)),
			};
		}

		if (cobaltMedia.filename) {
			return {
				kind: cobaltMedia.mediaKind,
				file: new InputFile(cobaltMedia.filename),
			};
		}
	}

	console.info("[DownloadMedia] Cobalt failed, retrying with yt-dlp", {
		url,
		mode,
	});

	try {
		const downloadId = `${Date.now()}-${crypto.randomUUID()}`;
		const prepared =
			mode === "video"
				? await prepareYoutubeVideo(url, downloadId)
				: await prepareYtDlpMedia(url, downloadId);

		if (!prepared) {
			return null;
		}

		if (prepared.sizeMb > MAX_VIDEO_SIZE_MB) {
			console.warn("[DownloadMedia] yt-dlp media exceeds size limit", {
				url,
				mode,
				mediaKind: prepared.mediaKind,
				sizeMb: prepared.sizeMb,
				limitMb: MAX_VIDEO_SIZE_MB,
			});
			return null;
		}

		const filename =
			mode === "video"
				? await downloadYoutubeVideo(prepared, tempDir)
				: await downloadYtDlpMedia(prepared, tempDir);

		console.info("[DownloadMedia] Downloaded media with yt-dlp", {
			url,
			mode,
			mediaKind: prepared.mediaKind,
			title: prepared.title,
			extension: prepared.extension,
			sizeMb: prepared.sizeMb,
		});

		return {
			kind: prepared.mediaKind,
			file: new InputFile(
				filename,
				mode === "video"
					? `${prepared.title}.${prepared.extension}`
					: undefined,
			),
			title: prepared.title,
		};
	} catch (error) {
		console.error("[DownloadMedia] yt-dlp failed to download media", {
			url,
			mode,
			error,
		});
		return null;
	}
}
