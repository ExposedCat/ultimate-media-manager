import type { PostCaptionMeta } from "./caption.ts";

export type CachedMedia =
	| {
			kind: "image";
			fileId: string;
			metadata?: PostCaptionMeta;
	  }
	| {
			kind: "video";
			fileId: string;
			metadata?: PostCaptionMeta;
	  }
	| {
			kind: "audio";
			fileId: string;
			metadata?: PostCaptionMeta;
	  }
	| {
			kind: "images";
			items: CachedMediaGroupItem[];
			metadata?: PostCaptionMeta;
	  };

export type CachedMediaGroupItem = {
	kind: "image" | "video";
	fileId: string;
};

const MAX_CACHE_ENTRIES = 50;
const mediaCache = new Map<string, CachedMedia>();

type TelegramMediaMessage = {
	audio?: { file_id?: string };
	photo?: { file_id?: string }[];
	rich_message?: { blocks?: RichBlockLike[] };
	video?: { file_id?: string };
};

type RichBlockLike = {
	audio?: { file_id?: string };
	blocks?: RichBlockLike[];
	photo?: { file_id?: string }[];
	type?: string;
	video?: { file_id?: string };
};

export function normalizeMediaCacheUrl(url: string) {
	try {
		const normalized = new URL(url.trim());
		normalized.protocol = normalized.protocol.toLowerCase();
		normalized.hostname = normalized.hostname.toLowerCase();
		normalized.hash = "";
		normalized.searchParams.sort();

		if (normalized.pathname !== "/" && normalized.pathname.endsWith("/")) {
			normalized.pathname = normalized.pathname.slice(0, -1);
		}

		return normalized.toString();
	} catch {
		return url.trim();
	}
}

export function getCachedMedia(url: string) {
	return mediaCache.get(normalizeMediaCacheUrl(url)) ?? null;
}

export function setCachedMedia(url: string, media: CachedMedia) {
	const normalizedUrl = normalizeMediaCacheUrl(url);

	if (mediaCache.has(normalizedUrl)) {
		mediaCache.delete(normalizedUrl);
	} else if (mediaCache.size >= MAX_CACHE_ENTRIES) {
		const oldestUrl = mediaCache.keys().next().value;
		if (oldestUrl) {
			mediaCache.delete(oldestUrl);
		}
	}

	mediaCache.set(normalizedUrl, media);
	return normalizedUrl;
}

export function deleteCachedMedia(url: string) {
	return mediaCache.delete(normalizeMediaCacheUrl(url));
}

export function getCachedMediaFromSingleMessage(
	kind: "image" | "video" | "audio",
	message: unknown,
): Extract<CachedMedia, { kind: "image" | "video" | "audio" }> | null {
	const mediaMessage = message as TelegramMediaMessage;
	if (kind === "image") {
		const fileId = mediaMessage.photo?.at(-1)?.file_id;
		return fileId ? { kind, fileId } : null;
	}

	const fileId = mediaMessage[kind]?.file_id;
	return fileId ? { kind, fileId } : null;
}

export function getCachedMediaFromMediaGroup(
	messages: unknown[],
): Extract<CachedMedia, { kind: "images" }> | null {
	const items = messages
		.map((message): CachedMediaGroupItem | null => {
			const mediaMessage = message as TelegramMediaMessage;
			const photoFileId = mediaMessage.photo?.at(-1)?.file_id;
			if (photoFileId) {
				return { kind: "image", fileId: photoFileId };
			}

			const videoFileId = mediaMessage.video?.file_id;
			if (videoFileId) {
				return { kind: "video", fileId: videoFileId };
			}

			return null;
		})
		.filter((item): item is CachedMediaGroupItem => Boolean(item));

	return items.length > 0 ? { kind: "images", items } : null;
}

export function getCachedMediaFromRichMessage(
	message: unknown,
): CachedMedia | null {
	const blocks = (message as TelegramMediaMessage).rich_message?.blocks ?? [];
	const items = collectRichMedia(blocks);
	if (items.length === 0) {
		return null;
	}
	if (items.length > 1) {
		const groupItems = items.filter(
			(item): item is Extract<typeof item, { kind: "image" | "video" }> =>
				item.kind === "image" || item.kind === "video",
		);
		return groupItems.length === items.length
			? { kind: "images", items: groupItems }
			: null;
	}

	return items[0];
}

function collectRichMedia(
	blocks: RichBlockLike[],
): Extract<CachedMedia, { kind: "image" | "video" | "audio" }>[] {
	const media: Extract<CachedMedia, { kind: "image" | "video" | "audio" }>[] =
		[];
	for (const block of blocks) {
		const photoFileId = block.photo?.at(-1)?.file_id;
		if (photoFileId) {
			media.push({ kind: "image", fileId: photoFileId });
		}
		if (block.video?.file_id) {
			media.push({ kind: "video", fileId: block.video.file_id });
		}
		if (block.audio?.file_id) {
			media.push({ kind: "audio", fileId: block.audio.file_id });
		}
		if (block.blocks) {
			media.push(...collectRichMedia(block.blocks));
		}
	}
	return media;
}
