import { assert, assertEquals } from "jsr:@std/assert@^1";

import { buildPostCaption, captionEnabled } from "../src/services/caption.ts";
import type { Settings } from "../src/types/database.ts";

const settings: Settings = {
	cleanup: true,
	captionReddit: true,
	captionSoundcloud: true,
	captionInstagram: false,
	captionTiktok: false,
	captionTwitter: false,
	captionYoutube: false,
	captionPinterest: false,
	errors: false,
};

Deno.test("reddit caption shows title and a facts line", () => {
	const caption = buildPostCaption("reddit", {
		title: "Seen in the UK",
		subreddit: "pics",
		authorHandle: "Gertrudethecurious",
		likeCount: 9969,
		commentCount: 251,
	});
	assertEquals(
		caption,
		'<blockquote expandable><b>Seen in the UK</b>\n<a href="https://www.reddit.com/r/pics">r/pics</a> <tg-emoji emoji-id="5875078273775439450">🔼</tg-emoji> 9,969 <tg-emoji emoji-id="5994297722574737553">💬</tg-emoji> 251</blockquote>',
	);
});

Deno.test("reddit caption is null without a title", () => {
	assertEquals(buildPostCaption("reddit", { likeCount: 5 }), null);
});

Deno.test("soundcloud caption shows track and artist", () => {
	const caption = buildPostCaption("soundcloud", {
		title: "Không Buông",
		authorName: "Hngle",
	});
	assertEquals(
		caption,
		"<blockquote expandable><b>Không Buông</b> — Hngle</blockquote>",
	);
});

Deno.test("text platforms quote the post text and escape HTML", () => {
	const caption = buildPostCaption("tiktok", {
		text: 'hello <b>world</b> & "more"',
	});
	assertEquals(
		caption,
		"<blockquote expandable>hello &lt;b&gt;world&lt;/b&gt; &amp; &quot;more&quot;</blockquote>",
	);
});

Deno.test("text platforms without text yield no caption", () => {
	assertEquals(buildPostCaption("twitter", { likeCount: 3 }), null);
});

Deno.test("long text is truncated with an ellipsis", () => {
	const caption = buildPostCaption("instagram", { text: "a".repeat(2000) });
	assert(caption !== null);
	assert(caption.endsWith("…</blockquote>"));
	assert(caption.length < 1000);
});

Deno.test("captionEnabled follows per-platform settings", () => {
	assertEquals(captionEnabled(settings, "reddit"), true);
	assertEquals(captionEnabled(settings, "tiktok"), false);
	assertEquals(captionEnabled(settings, "facebook"), false);
	assertEquals(captionEnabled(settings, "youtubeVideo"), false);
});
