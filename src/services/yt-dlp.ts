import _YTDlpWrap from "yt-dlp-wrap";

// TODO: Use better typed lib
export const Binary = _YTDlpWrap.default;
export type YTDlpWrap = _YTDlpWrap.default;

export function loadBinary() {
	return new Binary("./ytdlp");
}

const ERROR_MAPPING = Object.entries({
	"no video in this post": "🖼 Picture posts can't be downloaded",
	"rate-limit": "🫠 Too many posts were downloaded recently, limit exceeded",
});

export const humanifyError = (output: string) => {
	for (const [partial, value] of ERROR_MAPPING) {
		if (output.includes(partial)) {
			return value;
		}
	}
	const rawError = output.split("ERROR: ")[1] ?? output;
	const trimmedError = rawError.replace(/\[.+\] .+?: /, "");
	return `😵‍💫 ${trimmedError}`;
};

export async function downloadMedia(
	binary: YTDlpWrap,
	url: string,
	path: string,
): Promise<string> {
	const options: string[] = [url]; //, "--cookies", "cookies"];
	options.push(
		"-f",
		"bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo[ext=mp4]+bestaudio[ext=mp4]/best",
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

export async function downloadYouTubeAudio(
	binary: YTDlpWrap,
	url: string,
	path: string,
) {
	const options = ["-x", "--audio-format", "mp3", url, "-o", path];
	const metadata = await binary.getVideoInfo(url);
	return new Promise<{ path: string; title: string; thumbnail: string }>(
		(resolve, reject) =>
			binary
				.exec(options)
				.on("error", (error) => reject(error))
				.on("close", () => {
					return resolve({
						path,
						title: metadata.title,
						thumbnail: metadata.thumbnail,
					});
				}),
	);
}
