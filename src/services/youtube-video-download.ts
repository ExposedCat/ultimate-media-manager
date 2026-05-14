import { type Payload, create as createYoutubeDl } from "youtube-dl-exec";

import { APP_ENV } from "../config/env.ts";

const VIDEO_FORMAT =
	"bv*[height<=720][ext=mp4]+ba[ext=m4a]/b[height<=720][ext=mp4]/bv*[height<=720]+ba/b[height<=720]/b";
const GENERIC_MEDIA_FORMAT = `${VIDEO_FORMAT}/ba/b`;

const BYTES_PER_MB = 1024 * 1024;
const AUDIO_EXTENSIONS = ["mp3", "wav", "ogg", "m4a", "aac", "flac", "opus"];

type YoutubeDlPayload = Payload & { filesize?: number | null };

export type PreparedYoutubeVideo = {
	downloadId: string;
	extension: string;
	format: string;
	mediaKind: "audio" | "video";
	sizeMb: number;
	title: string;
	url: string;
};

type YoutubeVideoDownloader = {
	prepare: (
		url: string,
		downloadId: string,
		format?: string,
		defaultTitle?: string,
	) => Promise<PreparedYoutubeVideo | null>;
	download: (
		preparedVideo: PreparedYoutubeVideo,
		tempDir: string,
	) => Promise<string>;
};

function pickVideoSizeBytes(payload: YoutubeDlPayload): number {
	for (const download of payload.requested_downloads ?? []) {
		if (
			typeof download.filesize_approx === "number" &&
			download.filesize_approx > 0
		) {
			return download.filesize_approx;
		}
	}

	let requestedFormatsSize = 0;
	for (const format of payload.requested_formats ?? []) {
		requestedFormatsSize += format.filesize ?? format.filesize_approx ?? 0;
	}

	if (requestedFormatsSize > 0) {
		return requestedFormatsSize;
	}

	return payload.filesize ?? payload.filesize_approx ?? 0;
}

function pickExtension(payload: YoutubeDlPayload) {
	return payload.requested_downloads[0]?.ext ?? payload.ext ?? "mp4";
}

function pickMediaKind(payload: YoutubeDlPayload): "audio" | "video" {
	const extension = pickExtension(payload).toLowerCase();
	return AUDIO_EXTENSIONS.includes(extension) ? "audio" : "video";
}

function sanitizeFilenamePart(value: string) {
	return Array.from(value)
		.map((character) => {
			if (
				character === "<" ||
				character === ">" ||
				character === ":" ||
				character === '"' ||
				character === "/" ||
				character === "\\" ||
				character === "|" ||
				character === "?" ||
				character === "*" ||
				character.charCodeAt(0) < 32
			) {
				return " ";
			}

			return character;
		})
		.join("")
		.replace(/\s+/g, " ")
		.trim();
}

class YoutubeDlExecYoutubeVideoDownloader implements YoutubeVideoDownloader {
	readonly #youtubeDl = createYoutubeDl(APP_ENV.YT_DLP_PATH);

	async prepare(
		url: string,
		downloadId: string,
		format = VIDEO_FORMAT,
		defaultTitle = "Downloaded Video",
	): Promise<PreparedYoutubeVideo | null> {
		console.info("[yt-dlp] Preparing media", { url, downloadId, format });
		try {
			const payload = (await this.#youtubeDl(url, {
				dumpSingleJson: true,
				format,
				mergeOutputFormat: "mp4",
				noCheckCertificates: true,
				noPlaylist: true,
				noWarnings: true,
				skipDownload: true,
			})) as YoutubeDlPayload;

			const sizeMb = pickVideoSizeBytes(payload) / BYTES_PER_MB;
			const preparedVideo = {
				downloadId,
				extension: pickExtension(payload),
				format,
				mediaKind: pickMediaKind(payload),
				sizeMb,
				title: sanitizeFilenamePart(payload.title) || defaultTitle,
				url,
			};

			console.info("[yt-dlp] Prepared media", {
				url,
				downloadId,
				title: preparedVideo.title,
				extension: preparedVideo.extension,
				mediaKind: preparedVideo.mediaKind,
				sizeMb: preparedVideo.sizeMb,
			});

			return preparedVideo;
		} catch (error) {
			console.error("[yt-dlp] Failed to prepare media", {
				url,
				downloadId,
				error,
			});
			return null;
		}
	}

	async download(preparedVideo: PreparedYoutubeVideo, tempDir: string) {
		console.info("[yt-dlp] Starting download", {
			url: preparedVideo.url,
			downloadId: preparedVideo.downloadId,
			format: preparedVideo.format,
			tempDir,
		});
		await this.#youtubeDl(preparedVideo.url, {
			format: preparedVideo.format,
			mergeOutputFormat: "mp4",
			noCheckCertificates: true,
			noPlaylist: true,
			noWarnings: true,
			output: `${tempDir}/${preparedVideo.downloadId}.%(ext)s`,
		});

		for await (const entry of Deno.readDir(tempDir)) {
			if (
				entry.isFile &&
				entry.name.startsWith(`${preparedVideo.downloadId}.`) &&
				!entry.name.endsWith(".part")
			) {
				console.info("[yt-dlp] Download completed", {
					url: preparedVideo.url,
					downloadId: preparedVideo.downloadId,
					file: `${tempDir}/${entry.name}`,
				});
				return `${tempDir}/${entry.name}`;
			}
		}

		console.error("[yt-dlp] Download finished without output file", {
			url: preparedVideo.url,
			downloadId: preparedVideo.downloadId,
			tempDir,
		});
		throw new Error("yt-dlp finished without producing a media file");
	}
}

const youtubeVideoDownloader: YoutubeVideoDownloader =
	new YoutubeDlExecYoutubeVideoDownloader();

export async function prepareYtDlpMedia(url: string, downloadId: string) {
	return await youtubeVideoDownloader.prepare(
		url,
		downloadId,
		GENERIC_MEDIA_FORMAT,
		"Downloaded Media",
	);
}

export async function downloadYtDlpMedia(
	preparedVideo: PreparedYoutubeVideo,
	tempDir: string,
) {
	return await youtubeVideoDownloader.download(preparedVideo, tempDir);
}

export async function prepareYoutubeVideo(url: string, downloadId: string) {
	return await youtubeVideoDownloader.prepare(
		url,
		downloadId,
		VIDEO_FORMAT,
		"Downloaded YouTube Video",
	);
}

export async function downloadYoutubeVideo(
	preparedVideo: PreparedYoutubeVideo,
	tempDir: string,
) {
	return await youtubeVideoDownloader.download(preparedVideo, tempDir);
}
