import { APP_ENV } from "../config/env.ts";

import {
	type DownloadMediaFile,
	type DownloadMediaResult,
	bundle,
	mediaKindForExtension,
} from "./media.ts";
import { warpProxy } from "./warp.ts";

const CONTENT_TYPE_BY_EXTENSION = new Map([
	["jpg", "image/jpeg"],
	["jpeg", "image/jpeg"],
	["png", "image/png"],
	["webp", "image/webp"],
	["gif", "image/gif"],
	["mp4", "video/mp4"],
	["webm", "video/webm"],
	["mp3", "audio/mpeg"],
	["m4a", "audio/mp4"],
]);

const YTDLP_FORMAT = "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/bv*+ba/b";

export async function downloadWithYtdlp(
	url: string,
): Promise<DownloadMediaResult | null> {
	const directory = await Deno.makeTempDir({ prefix: "umm-ytdlp-" });
	try {
		const args = [
			"--no-playlist",
			"--no-warnings",
			"--quiet",
			"--no-mtime",
			"--restrict-filenames",
			"--format",
			YTDLP_FORMAT,
			"--merge-output-format",
			"mp4",
			"--ffmpeg-location",
			APP_ENV.FFMPEG_PATH,
			"--output",
			`${directory}/%(autonumber)03d-%(id)s.%(ext)s`,
			...(warpProxy ? ["--proxy", warpProxy] : []),
			url,
		];
		const { success, stderr } = await new Deno.Command(APP_ENV.YT_DLP_PATH, {
			args,
			stderr: "piped",
		}).output();
		if (!success) {
			console.warn("[Ytdlp] Download failed", {
				url,
				error: new TextDecoder().decode(stderr).slice(0, 300),
			});
			return null;
		}
		const files = await readDownloadedFiles(directory);
		console.info("[Ytdlp] Downloaded media", { url, fileCount: files.length });
		return bundle(files);
	} catch (error) {
		console.warn("[Ytdlp] Could not run", {
			url,
			error: error instanceof Error ? error.message : String(error),
		});
		return null;
	} finally {
		await Deno.remove(directory, { recursive: true }).catch(() => undefined);
	}
}

async function readDownloadedFiles(
	directory: string,
): Promise<DownloadMediaFile[]> {
	const names: string[] = [];
	for await (const entry of Deno.readDir(directory)) {
		if (
			entry.isFile &&
			CONTENT_TYPE_BY_EXTENSION.has(extensionOf(entry.name))
		) {
			names.push(entry.name);
		}
	}
	names.sort();
	const files: DownloadMediaFile[] = [];
	for (const name of names) {
		const data = await Deno.readFile(`${directory}/${name}`);
		if (data.length === 0) {
			continue;
		}
		const extension = extensionOf(name);
		files.push({
			contentType: CONTENT_TYPE_BY_EXTENSION.get(extension),
			data,
			extension,
			filename: name,
			mediaKind: mediaKindForExtension(extension),
		});
	}
	return files;
}

function extensionOf(filename: string): string {
	const extension = filename.split(".").at(-1);
	return extension && extension !== filename ? extension.toLowerCase() : "";
}
