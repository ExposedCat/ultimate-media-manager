import _YTDlpWrap from "yt-dlp-wrap";
import type { MediaAdapterData } from "./media-adapters.js";

// TODO: Use better typed lib
export const Binary = _YTDlpWrap.default;
export type YTDlpWrap = _YTDlpWrap.default;

export function loadBinary() {
	return new Binary("./ytdlp");
}

const ERROR_MAPPING = [
	["no video in this post", "🖼 Picture posts can't be downloaded"],
	["rate-limit", "🫠 Download failed: platform limits reached"],
	["not be comfortable", "🔞 Download failed: platform blocked NSFW download"],
	["Read timed out", "🤕 Download failed: video didn't load"],
	[
		"Connection aborted",
		"🤨 Video is not available for download for some reason",
	],
	["Sign in", "🤖 Download failed: platform blocked the bot"],
	[
		"Only images",
		"😥 Platform rejected downloading this video.\nPlease report to @ExposedCatDev!",
	],
	[
		"format is not available",
		"🫣 MP4 format is not available for this video.\nPlease report to @ExposedCatDev!",
	],
];

export const humanifyError = (output: string) => {
	for (const [partial, value] of ERROR_MAPPING) {
		if (output.includes(partial)) {
			return value;
		}
	}
	const rawError = output.split("ERROR: ")[1] ?? output;
	const trimmedError = rawError.replace(/\[.+\] .+?: /, "");
	return `😵‍💫 Download failed\n<pre><code class="language-error">${trimmedError}</code></pre>\nPlease report to @ExposedCatDev!`;
};

export async function downloadMedia(
	binary: YTDlpWrap,
	url: string,
	sourceType: MediaAdapterData["source"]["type"],
	path: string,
): Promise<string> {
	const options: string[] = [url];
	if (sourceType === "youtube") {
		options.push("--cookies", "cookies/youtube.txt");
	} else if (sourceType === "tiktok") {
		options.push("--cookies", "cookies/tiktok.txt");
	} else if (sourceType === "instagram") {
		options.push("--cookies", "cookies/instagram.txt");
	}

	options.push(
		"-f",
		"bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo[ext=mp4]+bestaudio[ext=mp4]/bestvideo[ext=mhtml]+bestaudio[ext=m4a]/bestvideo[ext=mhtml]+bestaudio[ext=mp4]/best",
	);

	options.push("-o", path);

	let destination = path;
	return await new Promise<string>((resolve, reject) =>
		binary
			.exec(options)
			.on("ytDlpEvent", (event, data) => {
				if (event === "download" && data.startsWith(" Destination")) {
					destination = data.replace(" Destination: ", "").trim();
				} else if (event === "Merger") {
					destination = data.split('"')[1]?.split('"')[0] ?? destination;
				}
			})
			.on("error", (error) => reject(error))
			.on("close", () => resolve(destination)),
	);
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
