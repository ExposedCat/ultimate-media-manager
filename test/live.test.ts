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
	name: "reddit hosted video downloads as a muxed video",
	ignore: !runs("reddit"),
	...options,
}, () =>
	downloads(
		"https://www.reddit.com/r/catvideos/comments/ftoeo7/luna_doesnt_want_to_be_bothered_while_shes_napping/",
		"video",
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
	name: "x i/status link downloads as a video",
	ignore: !runs("twitter"),
	...options,
}, () => downloads("https://x.com/i/status/2034598055668769263", "video"));

Deno.test({
	name: "x handle status with /video/1 suffix downloads as a video",
	ignore: !runs("twitter"),
	...options,
}, () =>
	downloads(
		"https://x.com/klara_sjo/status/2036281665748717831/video/1",
		"video",
	));

Deno.test({
	name: "x status with tracking query downloads as a video",
	ignore: !runs("twitter"),
	...options,
}, () =>
	downloads(
		"https://x.com/NothingIsArt/status/2054224375545565681?s=20",
		"video",
	));

Deno.test({
	name: "x handle status downloads as a video",
	ignore: !runs("twitter"),
	...options,
}, () =>
	downloads(
		"https://x.com/phantompain281/status/2030252928682905845",
		"video",
	));

Deno.test({
	name: "facebook share link downloads as a video",
	ignore: !runs("facebook"),
	...options,
}, () => downloads("https://www.facebook.com/share/v/19MXsYX58F/", "video"));

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
	name: "youtube watch downloads as a video",
	ignore: !runs("youtube"),
	...options,
}, () => downloads("https://www.youtube.com/watch?v=jNQXAC9IVRw", "video"));

Deno.test({
	name: "youtube shorts downloads as a video",
	ignore: !runs("youtube"),
	...options,
}, () => downloads("https://www.youtube.com/shorts/OR9PgMqSjtw", "video"));

Deno.test({
	name: "youtu.be shortlink downloads as a video",
	ignore: !runs("youtube"),
	...options,
}, () => downloads("https://youtu.be/VYXAND8enUo", "video"));
