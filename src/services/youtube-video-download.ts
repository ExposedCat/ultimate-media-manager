import { type Payload, create as createYoutubeDl } from "youtube-dl-exec";

import { APP_ENV } from "../config/env.ts";

const VIDEO_FORMAT =
	"bv*[height<=720][ext=mp4]+ba[ext=m4a]/b[height<=720][ext=mp4]/bv*[height<=720]+ba/b[height<=720]/b";

const BYTES_PER_MB = 1024 * 1024;

type YoutubeDlPayload = Payload & { filesize?: number | null };

export type PreparedYoutubeVideo = {
	downloadId: string;
	extension: string;
	sizeMb: number;
	title: string;
	url: string;
};

type YoutubeVideoDownloader = {
	prepare: (
		url: string,
		downloadId: string,
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
	): Promise<PreparedYoutubeVideo | null> {
		try {
			const payload = (await this.#youtubeDl(url, {
				dumpSingleJson: true,
				format: VIDEO_FORMAT,
				mergeOutputFormat: "mp4",
				noCheckCertificates: true,
				noPlaylist: true,
				noWarnings: true,
				skipDownload: true,
			})) as YoutubeDlPayload;

			const sizeMb = pickVideoSizeBytes(payload) / BYTES_PER_MB;

			return {
				downloadId,
				extension: pickExtension(payload),
				sizeMb,
				title:
					sanitizeFilenamePart(payload.title) || "Downloaded YouTube Video",
				url,
			};
		} catch (error) {
			console.error("Failed to prepare YouTube video", error);
			return null;
		}
	}

	async download(preparedVideo: PreparedYoutubeVideo, tempDir: string) {
		await this.#youtubeDl(preparedVideo.url, {
			format: VIDEO_FORMAT,
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
				return `${tempDir}/${entry.name}`;
			}
		}

		throw new Error("yt-dlp finished without producing a video file");
	}
}

const youtubeVideoDownloader: YoutubeVideoDownloader =
	new YoutubeDlExecYoutubeVideoDownloader();

export async function prepareYoutubeVideo(url: string, downloadId: string) {
	return await youtubeVideoDownloader.prepare(url, downloadId);
}

export async function downloadYoutubeVideo(
	preparedVideo: PreparedYoutubeVideo,
	tempDir: string,
) {
	return await youtubeVideoDownloader.download(preparedVideo, tempDir);
}
