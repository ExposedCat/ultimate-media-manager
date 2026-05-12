import {
	type MediaAdapter,
	type MediaSource,
	downloadAdapter,
	youtubeVideoDownloadAdapter,
} from "./media-adapters.ts";

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

	{ type: "soundcloud", match: /soundcloud\.com\/.+?/ },
];

const DOWNLOAD_COMMAND_SOURCES: MediaSource[] = [
	...SOURCES,
	{ type: "youtubeVideo", match: "youtu.be/" },
	{ type: "youtubeVideo", match: "youtube.com/watch" },
	{ type: "youtubeVideo", match: "youtube.com/live/" },
	{ type: "youtubeVideo", match: "youtube.com/v/" },
	{ type: "youtubeVideo", match: "youtube.com/embed/" },
];

const PROXIES: Record<string, [string, string]> = {
	instagram: ["instagram", "d.ddinstagram"],
	twitter: ["x.com", "fxtwitter.com"],
};

function matchesSource(input: string, match: string | RegExp) {
	return typeof match === "string" ? input.includes(match) : match.test(input);
}

export type MatchInputResult =
	| {
			type: MediaSource["type"];
			proxyUrl?: string;
			adapter: MediaAdapter;
			match: string | RegExp;
	  }
	| {
			type: null;
			proxyUrl: null;
			adapter: null;
			match: null;
	  };

function getSourceAdapter(type: MediaSource["type"]) {
	return {
		instagram: downloadAdapter,
		tiktok: downloadAdapter,
		facebook: downloadAdapter,
		youtube: downloadAdapter,
		twitter: downloadAdapter,
		pinterest: downloadAdapter,
		soundcloud: downloadAdapter,
		reddit: downloadAdapter,
		youtubeVideo: youtubeVideoDownloadAdapter,
	}[type];
}

function matchWithSources(
	input: string,
	sources: MediaSource[],
): MatchInputResult {
	for (const { type, match } of sources) {
		if (matchesSource(input, match)) {
			const adapter = getSourceAdapter(type);

			const proxyUrl = PROXIES[type] ? input.replace(...PROXIES[type]) : input;

			return { type, proxyUrl, adapter, match };
		}
	}
	return { type: null, proxyUrl: null, adapter: null, match: null };
}

export type InputMatcher = (input: string) => MatchInputResult;

export function matchInput(input: string) {
	return matchWithSources(input, SOURCES);
}

export function matchDownloadCommandInput(input: string) {
	return matchWithSources(input, DOWNLOAD_COMMAND_SOURCES);
}
