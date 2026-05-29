export type CachedMedia =
	| {
			kind: "image";
			fileId: string;
	  }
	| {
			kind: "video";
			fileId: string;
	  }
	| {
			kind: "audio";
			fileId: string;
	  }
	| {
			kind: "images";
			fileIds: string[];
	  };

const MAX_CACHE_ENTRIES = 50;
const mediaCache = new Map<string, CachedMedia>();

type TelegramMediaMessage = {
	audio?: { file_id?: string };
	photo?: { file_id?: string }[];
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
	message: TelegramMediaMessage,
): Extract<CachedMedia, { kind: "image" | "video" | "audio" }> | null {
	if (kind === "image") {
		const fileId = message.photo?.at(-1)?.file_id;
		return fileId ? { kind, fileId } : null;
	}

	const fileId = message[kind]?.file_id;
	return fileId ? { kind, fileId } : null;
}

export function getCachedMediaFromMediaGroup(
	messages: unknown[],
): Extract<CachedMedia, { kind: "images" }> | null {
	const fileIds = messages
		.map((message) => (message as TelegramMediaMessage).photo?.at(-1)?.file_id)
		.filter((fileId): fileId is string => Boolean(fileId));

	return fileIds.length > 0 ? { kind: "images", fileIds } : null;
}
