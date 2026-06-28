import { type MediaItem, download, postfetch } from "@postfetch/core";

import {
	type DownloadMediaFile,
	type DownloadMediaResult,
	bundle,
} from "./media.ts";
import { warpFetch } from "./warp.ts";

const options = warpFetch ? { fetch: warpFetch } : {};

export async function downloadWithPostfetch(
	url: string,
): Promise<DownloadMediaResult | null> {
	try {
		const result = await postfetch(url, options);
		const files = await Promise.all(result.items.map(toDownloadMediaFile));
		console.info("[Postfetch] Resolved media", {
			url,
			platform: result.platform,
			fileCount: files.length,
		});
		return bundle(files);
	} catch (error) {
		console.warn("[Postfetch] Could not resolve", {
			url,
			error: error instanceof Error ? error.message : String(error),
		});
		return null;
	}
}

async function toDownloadMediaFile(
	item: MediaItem,
): Promise<DownloadMediaFile> {
	const response = await download(item, options);
	return {
		contentType: item.mime,
		data: new Uint8Array(await response.arrayBuffer()),
		extension: extensionOf(item.filename),
		filename: item.filename,
		mediaKind: item.kind,
	};
}

function extensionOf(filename: string): string {
	const extension = filename.split(".").at(-1);
	return extension && extension !== filename ? extension.toLowerCase() : "bin";
}
