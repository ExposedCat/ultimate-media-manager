import { assert } from "jsr:@std/assert@^1";

import { downloadMediaForUrl } from "../src/services/download-media.ts";

const live = Deno.env.get("UMM_LIVE") === "1";
const platform = Deno.env.get("UMM_LIVE_PLATFORM");

function runs(name: string): boolean {
	return live && (platform === undefined || platform === name);
}

async function downloads(
	url: string,
	kind: "image" | "video" | "audio" | "images",
): Promise<void> {
	const media = await downloadMediaForUrl(url);
	assert(media !== null, `no media resolved for ${url}`);
	assert(media.kind === kind, `expected ${kind}, got ${media.kind} for ${url}`);
	const bytes =
		media.kind === "images"
			? media.files.reduce((total, file) => total + file.media.data.length, 0)
			: (media.bytes?.length ?? 0);
	assert(bytes > 0, `downloaded 0 bytes for ${url}`);
}

const options = { sanitizeResources: false, sanitizeOps: false } as const;

Deno.test({
	name: "reddit gallery downloads as a media group",
	ignore: !runs("reddit"),
	...options,
}, () =>
	downloads(
		"https://www.reddit.com/r/pics/comments/1ugzn9p/seen_in_the_uk/",
		"images",
	));

Deno.test({
	name: "instagram reel downloads as a video",
	ignore: !runs("instagram"),
	...options,
}, () => downloads("https://www.instagram.com/reel/DZ0ixNxtvYq/", "video"));

Deno.test({
	name: "tiktok shortlink downloads as a video",
	ignore: !runs("tiktok"),
	...options,
}, () => downloads("https://vt.tiktok.com/ZSxpHvCUM/", "video"));

Deno.test({
	name: "x status downloads as a video",
	ignore: !runs("twitter"),
	...options,
}, () => downloads("https://x.com/i/status/2034598055668769263", "video"));

Deno.test({
	name: "pinterest video pin downloads as a video",
	ignore: !runs("pinterest"),
	...options,
}, () => downloads("https://www.pinterest.com/pin/3025924746345838/", "video"));

Deno.test({
	name: "soundcloud track downloads as audio",
	ignore: !runs("soundcloud"),
	...options,
}, () =>
	downloads(
		"https://soundcloud.com/alexxlofi/khong-buong-lofi-ver-hngle-x",
		"audio",
	));

Deno.test({
	name: "youtube downloads as a video (through WARP)",
	ignore: !runs("youtube"),
	...options,
}, () => downloads("https://www.youtube.com/watch?v=jNQXAC9IVRw", "video"));
