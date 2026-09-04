import {
	type PostMetadata,
	type PostfetchResult,
	type TwitterExtra,
	downloadBlob,
	postfetch,
} from "@postfetch/core";

import { APP_ENV } from "../config/env.ts";
import type { PostCaptionMeta } from "./caption.ts";
import {
	type DownloadMediaFile,
	type DownloadMediaResult,
	bundle,
} from "./media.ts";
import { warpFetch } from "./warp.ts";

export const POSTFETCH_MAX_BYTES = 50_000_000;

const fetchOptions = warpFetch ? { fetch: warpFetch } : {};
const resolveOptions = {
	...fetchOptions,
	tryMaxBytes: POSTFETCH_MAX_BYTES,
};

export async function downloadWithPostfetch(
	url: string,
): Promise<DownloadMediaResult | null> {
	try {
		const result = await postfetch(url, resolveOptions);
		const files = await Promise.all(
			result.items.map(async (item): Promise<DownloadMediaFile> => {
				const blob = await downloadBlob(item.url, {
					...fetchOptions,
					ffmpegPath: APP_ENV.FFMPEG_PATH,
					headers: item.headers,
					remux: item.mime === "video/mp4",
				});
				return {
					contentType: item.mime,
					data: new Uint8Array(await blob.arrayBuffer()),
					extension: extensionOf(item.filename),
					filename: item.filename,
					mediaKind: item.kind,
				};
			}),
		);
		console.info("[Postfetch] Resolved media", {
			url,
			platform: result.platform,
			fileCount: files.length,
		});
		const meta = toCaptionMeta(result);
		const resolved = bundle(files);
		return resolved
			? { ...resolved, metadata: meta }
			: { type: "text", metadata: meta };
	} catch (error) {
		console.warn("[Postfetch] Could not resolve", {
			url,
			error: error instanceof Error ? error.message : String(error),
		});
		throw error;
	}
}

type TwitterMetadata = PostMetadata & { extra?: TwitterExtra };

export function toCaptionMeta(
	result: PostfetchResult,
): PostCaptionMeta | undefined {
	if (!result.metadata) {
		return undefined;
	}
	if (result.platform === "twitter") {
		return toTwitterCaptionMeta(result.metadata, result.id, result.items);
	}
	const meta = result.metadata;
	return {
		...toBaseCaptionMeta(meta),
		subreddit:
			result.platform === "reddit"
				? result.metadata?.extra?.subreddit
				: undefined,
	};
}

function toBaseCaptionMeta(meta: PostMetadata): PostCaptionMeta {
	return {
		title: meta.title,
		text: meta.text,
		authorHandle: meta.author?.handle,
		authorName: meta.author?.name,
		authorVerified: meta.author?.verified,
		likeCount: meta.likeCount,
		commentCount: meta.commentCount,
	};
}

function toTwitterCaptionMeta(
	meta: TwitterMetadata,
	postId: string,
	items: PostfetchResult["items"],
): PostCaptionMeta {
	const quoted = meta.extra?.quotedTweet;
	return {
		...toBaseCaptionMeta(meta),
		mediaCount: items.filter((item) => item.id === postId).length,
		quotedPost: quoted
			? toTwitterCaptionMeta(quoted.metadata, quoted.id, items)
			: undefined,
	};
}

function extensionOf(filename: string): string {
	const extension = filename.split(".").at(-1);
	return extension && extension !== filename ? extension.toLowerCase() : "bin";
}
