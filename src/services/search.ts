type SearchEntry = {
	url: string;
	img_src?: string;
	img_format?: string;
	thumbnail_src?: string;
};

type SearchApiResponse = {
	results: SearchEntry[];
};

export type ImageSearchResult = {
	sourceUrl: string;
	imageUrl: string;
	thumbnailUrl: string;
	format: string | null;
};

type CachedSearchResult = {
	timestamp: number;
	results: ImageSearchResult[];
};

const JPEG_FORMATS = new Set(["jpg", "jpeg", "image/jpeg"]);
const JPEG_QUERY_SUFFIX = " (filetype:jpg | filetype:jpeg)";

const SEARCH_CACHE_TTL_MS = 60_000;

const imageSearchCache = new Map<string, CachedSearchResult>();

function isValidUrl(url: string) {
	try {
		new URL(url);
		return true;
	} catch {
		return false;
	}
}

function buildJpegSearchUri(query: string): string {
	const searchQuery = `${query}${JPEG_QUERY_SUFFIX}`;
	const uri = new URL("/search", process.env.SEARXNG_API_URL);
	uri.search = new URLSearchParams({
		format: "json",
		categories: "images",
		q: searchQuery,
	}).toString();
	return uri.toString();
}

function cleanupImageSearchCache(now: number) {
	for (const [query, cachedResult] of imageSearchCache) {
		if (now - cachedResult.timestamp > SEARCH_CACHE_TTL_MS) {
			imageSearchCache.delete(query);
		}
	}
}

export async function searchJpegImages(
	query: string,
): Promise<ImageSearchResult[]> {
	const now = Date.now();
	const cachedResult = imageSearchCache.get(query);
	if (cachedResult) {
		if (now - cachedResult.timestamp <= SEARCH_CACHE_TTL_MS) {
			console.log("cache hit", query);
			return cachedResult.results;
		}
	}

	try {
		console.log("fresh search", query);
		const request = await fetch(buildJpegSearchUri(query));
		const response = (await request.json()) as SearchApiResponse;
		const results = response.results.flatMap((result) => {
			const format = result.img_format?.toLowerCase() ?? null;
			if (format && !JPEG_FORMATS.has(format)) {
				return [];
			}

			const sourceUrl = result.url;
			const imageUrl = result.img_src ?? result.url;
			const thumbnailUrl = result.thumbnail_src ?? imageUrl;

			if (!isValidUrl(imageUrl) || !isValidUrl(thumbnailUrl)) {
				return [];
			}

			return [{ sourceUrl, imageUrl, thumbnailUrl, format }];
		});

		imageSearchCache.set(query, {
			timestamp: now,
			results,
		});

		return results;
	} catch (error) {
		console.error("Image search failed", error);
		return [];
	} finally {
		cleanupImageSearchCache(now);
	}
}
