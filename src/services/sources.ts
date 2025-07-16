import { type MediaSource, downloadAdapter } from "./media-adapters.js";

const SOURCES: MediaSource[] = [
	{ type: "tiktok", match: "tiktok.com/" },

	{ type: "instagram", match: /instagram.com\/.+?\/reel\// },
	{ type: "instagram", match: "instagram.com/reels/" },
	{ type: "instagram", match: "instagram.com/reel/" },
	{ type: "instagram", match: "instagram.com/p/" },

	{ type: "facebook", match: "fb.watch/" },
	{ type: "facebook", match: /facebook.com\/share\// },

	{ type: "youtube", match: "youtube.com/shorts/" },
	{ type: "twitter", match: /x.com\/.+?\/status\// },

	{ type: "pinterest", match: "pinterest.com/pin/" },

	{ type: "reddit", match: /reddit.com\/r\/.+?\// },

	{ type: "soundcloud", match: /soundcloud.com\/.+?\// },
];

const PROXIES: Record<string, [string, string]> = {
	instagram: ["instagram", "ddinstagram"],
	twitter: ["x.com", "fxtwitter.com"],
};

export function matchInput(input: string) {
	for (const { type, match } of SOURCES) {
		if (typeof match === "string" ? input.includes(match) : match.test(input)) {
			const adapter = {
				instagram: downloadAdapter,
				tiktok: downloadAdapter,
				facebook: downloadAdapter,
				youtube: downloadAdapter,
				twitter: downloadAdapter,
				pinterest: downloadAdapter,
				soundcloud: downloadAdapter,
				reddit: downloadAdapter,
			}[type];

			const proxyUrl = PROXIES[type] ? input.replace(...PROXIES[type]) : input;

			return { type, proxyUrl, adapter, match };
		}
	}
	return { type: null, proxyUrl: null, adapter: null, match: null };
}
