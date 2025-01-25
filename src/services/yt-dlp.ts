import _YTDlpWrap from "yt-dlp-wrap";

// TODO: Use better typed lib
export const Binary = _YTDlpWrap.default;
export type YTDlpWrap = _YTDlpWrap.default;

export function loadBinary() {
	return new Binary("./ytdlp");
}

export async function downloadMedia(
	binary: YTDlpWrap,
	url: string,
	path: string,
): Promise<string> {
	const options: string[] = [url]; //, "--cookies", "cookies"];
	options.push(
		"-f",
		"bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestaudio[ext=mp4]/best",
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
