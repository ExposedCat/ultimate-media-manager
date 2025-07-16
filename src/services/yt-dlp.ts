import fs from "node:fs/promises";
import _YTDlpWrap from "yt-dlp-wrap";
import type { MediaAdapterData } from "./media-adapters.js";

// TODO: Use better typed lib
export const Binary = _YTDlpWrap.default;
export type YTDlpWrap = _YTDlpWrap.default;

export function loadBinary() {
	return new Binary("./ytdlp");
}

export async function getVideoMetadata(binary: YTDlpWrap, url: string) {
	const output = await binary.execPromise([
		"-j",
		url,
		"--cookies",
		"cookies/youtube.txt",
	]);
	const metadata = JSON.parse(output);
	return {
		title: metadata.title,
		thumbnail: metadata.thumbnail,
		sizeMb: metadata.filesize_approx / 1024 / 1024,
	};
}

export async function downloadYouTubeAudio(
	binary: YTDlpWrap,
	url: string,
	path: string,
) {
	const options = ["-x", "--audio-format", "mp3", url, "-o", path];
	const { title, thumbnail } = await getVideoMetadata(binary, url);
	return new Promise<{ path: string; title: string; thumbnail: string }>(
		(resolve, reject) =>
			binary
				.exec(options)
				.on("error", (error) => reject(error))
				.on("close", () => {
					return resolve({ path, title, thumbnail });
				}),
	);
}
