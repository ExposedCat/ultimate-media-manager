import {
	type MediaItem,
	type PostMetadata,
	type PostfetchResult,
	type RemuxedVideo,
	type TwitterExtra,
	buildAudioSliderVideo,
	downloadBlob,
	postfetch,
} from "@postfetch/core";

import { APP_ENV } from "../config/env.ts";
import type { PostCaptionMeta } from "./caption.ts";
import { commentSections } from "./comment-sections.ts";
import {
	type DownloadMediaFile,
	type DownloadMediaResult,
	bundle,
} from "./media.ts";
import { slideshowDelay } from "./slideshow.ts";
import { warpFetch } from "./warp.ts";

export const POSTFETCH_MAX_BYTES = 50_000_000;

const fetchOptions = warpFetch ? { fetch: warpFetch } : {};
const resolveOptions = {
	...fetchOptions,
	tryMaxBytes: POSTFETCH_MAX_BYTES,
};

export async function downloadWithPostfetch(
	url: string,
	options: { slideshowDelay?: number; comments?: number } = {},
): Promise<DownloadMediaResult | null> {
	try {
		const requestOptions = { ...resolveOptions, comments: options.comments };
		const result = await postfetch(url, requestOptions);
		const delay = slideshowDelay(options);
		const files =
			delay > 0 && isAudioSlideshow(result.items)
				? [await downloadSlideshow(result, delay)]
				: await Promise.all(result.items.map(downloadItem));
		console.info("[Postfetch] Resolved media", {
			url,
			platform: result.platform,
			fileCount: files.length,
		});
		const meta = toCaptionMeta(result);
		// Keep comment attachments after the post/quote attachments, with ownership
		// retained in metadata for both fresh uploads and Telegram file-id reuse.
		if (
			meta &&
			(result.platform === "twitter" || result.platform === "reddit")
		) {
			try {
				const selected = commentSections(result.comments, (comment) => ({
					text: comment.metadata.text,
					mediaCount: comment.items.length,
				})).flat();
				const downloaded = await Promise.all(
					selected.map(async (comment) => ({
						metadata: {
							...toBaseCaptionMeta(comment.metadata),
							mediaCount: Math.min(1, comment.items.length),
						},
						files: await Promise.all(
							comment.items.slice(0, 1).map(downloadItem),
						),
					})),
				);
				meta.comments = downloaded.map((comment) => comment.metadata);
				files.push(...downloaded.flatMap((comment) => comment.files));
			} catch {
				meta.comments = [];
			}
		}
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

function isAudioSlideshow(items: MediaItem[]): boolean {
	return (
		items.length >= 2 &&
		items.at(-1)?.kind === "audio" &&
		items
			.slice(0, -1)
			.every((item) => item.kind === "image" || item.kind === "video")
	);
}

async function downloadSlideshow(
	result: PostfetchResult,
	delay: number,
): Promise<DownloadMediaFile> {
	const blob = await buildAudioSliderVideo(result.items, {
		...fetchOptions,
		delay: delay * 1000,
		ffmpegPath: APP_ENV.FFMPEG_PATH,
	});
	// Reuse Postfetch's upload metadata/thumbnail path on the local generated Blob.
	const url = URL.createObjectURL(blob);
	try {
		const video = await downloadBlob(url, {
			ffmpegPath: APP_ENV.FFMPEG_PATH,
			remux: true,
		});
		return await toVideoFile(
			video,
			`${result.archiveFilename.replace(/\.zip$/i, "")}_slideshow.mp4`,
		);
	} finally {
		URL.revokeObjectURL(url);
	}
}

async function toVideoFile(
	video: RemuxedVideo,
	filename: string,
): Promise<DownloadMediaFile> {
	return {
		contentType: "video/mp4",
		data: new Uint8Array(await video.blob.arrayBuffer()),
		duration: video.duration,
		extension: "mp4",
		filename,
		height: video.height,
		mediaKind: "video",
		thumbnail: new Uint8Array(await video.thumbnail.arrayBuffer()),
		width: video.width,
	};
}

// Accept parent metadata while deployments transition to the next Postfetch patch.
type TwitterMetadata = PostMetadata & {
	extra?: TwitterExtra & {
		parentTweet?: { id: string; metadata: TwitterMetadata };
	};
};

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
		...(result.platform === "reddit" && { mediaCount: result.items.length }),
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
		createdAt: meta.createdAt,
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
	const parent = meta.extra?.parentTweet;
	const isComment = !!(parent || meta.extra?.replyToId);
	return {
		...toBaseCaptionMeta(meta),
		...(isComment && { isComment: true }),
		mediaCount: items.filter((item) => item.id === postId).length,
		parentPost: parent
			? toTwitterCaptionMeta(parent.metadata, parent.id, [])
			: undefined,
		quotedPost: quoted
			? toTwitterCaptionMeta(quoted.metadata, quoted.id, items)
			: undefined,
	};
}

function extensionOf(filename: string): string {
	const extension = filename.split(".").at(-1);
	return extension && extension !== filename ? extension.toLowerCase() : "bin";
}

async function downloadItem(item: MediaItem): Promise<DownloadMediaFile> {
	if (item.mime === "video/mp4") {
		return toVideoFile(
			await downloadBlob(item, {
				...fetchOptions,
				ffmpegPath: APP_ENV.FFMPEG_PATH,
				remux: true,
			}),
			item.filename,
		);
	}
	const blob = await downloadBlob(item, fetchOptions);
	return {
		contentType: item.mime,
		data: new Uint8Array(await blob.arrayBuffer()),
		extension: extensionOf(item.filename),
		filename: item.filename,
		mediaKind: item.kind,
	};
}
