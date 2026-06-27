import { type MediaItem, detect, download, postfetch } from "@postfetch/core";

import type { DownloadMediaFile, DownloadMediaResult } from "./cobalt.ts";

// Platforms postfetch resolves directly, no Cobalt server needed. YouTube is left
// out on purpose: its CDN gates datacenter IPs (where the bot runs), so yt-dlp via
// Cobalt stays the path for it. Everything here falls back to Cobalt on failure.
const POSTFETCH_PLATFORMS = new Set([
	"facebook",
	"instagram",
	"pinterest",
	"reddit",
	"soundcloud",
	"tiktok",
	"twitter",
]);

export async function downloadWithPostfetch(
	url: string,
): Promise<DownloadMediaResult | null> {
	if (!isPostfetchPlatform(url)) {
		return null;
	}

	try {
		const result = await postfetch(url);
		const files = await Promise.all(result.items.map(toDownloadMediaFile));
		return bundle(files);
	} catch (error) {
		console.warn(
			"[Postfetch] Failed to resolve media; falling back to Cobalt",
			{
				url,
				error,
			},
		);
		return null;
	}
}

function isPostfetchPlatform(url: string): boolean {
	try {
		return POSTFETCH_PLATFORMS.has(detect(url));
	} catch {
		return false;
	}
}

function bundle(files: DownloadMediaFile[]): DownloadMediaResult | null {
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

// postfetch resolves to URLs (and remuxes DASH/HLS at download time); download
// returns the ready bytes, which map straight onto Cobalt's file shape.
async function toDownloadMediaFile(
	item: MediaItem,
): Promise<DownloadMediaFile> {
	const response = await download(item);
	const data = new Uint8Array(await response.arrayBuffer());
	return {
		contentType: item.mime,
		data,
		extension: extensionOf(item.filename),
		filename: item.filename,
		mediaKind: item.kind,
	};
}

function extensionOf(filename: string): string {
	const extension = filename.split(".").at(-1);
	return extension && extension !== filename ? extension.toLowerCase() : "bin";
}
