import { assertEquals, assertStringIncludes } from "jsr:@std/assert@^1";

import {
	buildRichMessage,
	stripTrailingTcoUrl,
} from "../src/services/rich-message.ts";

Deno.test("reddit rich messages put an h5 title above a media slideshow", () => {
	const result = buildRichMessage({
		baseHtml:
			'<a href="tg://user?id=42">Sender</a> shared <a href="https://reddit.com/post">this slider</a>',
		captionEnabled: true,
		media: [
			{ kind: "image", media: "photo-file" },
			{ kind: "video", media: "video-file" },
		],
		metadata: {
			title: "Seen in <the UK>",
			text: "Post <body>",
			subreddit: "pics",
			authorHandle: "Gertrudethecurious",
			likeCount: 9969,
			commentCount: 251,
		},
		sourceType: "reddit",
	});

	assertEquals(
		result.html,
		'<h5>Seen in &lt;the UK&gt;</h5>\n<tg-slideshow><img src="tg://photo?id=media_0"/><video src="tg://video?id=media_1"/></tg-slideshow>\n<blockquote expandable>Post &lt;body&gt;</blockquote>\n<p><a href="https://www.reddit.com/r/pics">r/pics</a> <tg-emoji emoji-id="5875078273775439450">🔼</tg-emoji> 9,969 <tg-emoji emoji-id="5994297722574737553">💬</tg-emoji> 251</p>\n<p><tg-emoji emoji-id="5343641195484560502">👽</tg-emoji> <a href="tg://user?id=42">Sender</a> shared <a href="https://reddit.com/post">this slider</a></p>',
	);
	assertEquals(result.html?.includes("Gertrudethecurious"), false);
	assertEquals(result.media, [
		{ id: "media_0", media: { type: "photo", media: "photo-file" } },
		{
			id: "media_1",
			media: {
				type: "video",
				media: "video-file",
				supports_streaming: true,
			},
		},
	]);
});

Deno.test("hashtags stay quoted and sender attribution appears below", () => {
	const result = buildRichMessage({
		baseHtml: "Sender shared this video",
		captionEnabled: true,
		media: [{ kind: "video", media: "video-file" }],
		metadata: {
			text: "blah & more #tag1 #tag2",
			authorHandle: "fallback-handle",
			authorName: "Creator <Name>",
			authorVerified: true,
		},
		sourceType: "instagram",
	});
	assertEquals(
		result.html,
		'<video src="tg://video?id=media_0"/>\n<blockquote expandable>blah &amp; more #tag1 #tag2</blockquote>\n<p><tg-emoji emoji-id="5454400924510334242">📸</tg-emoji> Sender shared this video</p>',
	);
	assertEquals(result.html?.includes("Creator"), false);

	const tiktok = buildRichMessage({
		baseHtml: "Sender shared this video",
		captionEnabled: true,
		media: [{ kind: "video", media: "video-file" }],
		metadata: {
			text: "TikTok caption #fyp #video",
			authorHandle: "creator",
		},
		sourceType: "tiktok",
	});
	assertEquals(
		tiktok.html,
		'<video src="tg://video?id=media_0"/>\n<blockquote expandable>TikTok caption #fyp #video</blockquote>\n<p><tg-emoji emoji-id="5454351124364542651">🎵</tg-emoji> Sender shared this video</p>',
	);
	assertEquals(tiktok.html?.includes("creator"), false);
});

Deno.test("Markdown links in platform bodies render as Telegram links", () => {
	const result = buildRichMessage({
		baseHtml: "Sender shared this image",
		captionEnabled: true,
		media: [{ kind: "image", media: "photo-file" }],
		metadata: {
			text: "Read [the post](https://example.com/post?id=1&source=feed)",
		},
		sourceType: "facebook",
	});

	assertStringIncludes(
		result.html ?? "",
		'<blockquote expandable>Read <a href="https://example.com/post?id=1&amp;source=feed">the post</a></blockquote>',
	);
});

Deno.test("tag-only captions keep hashtags in the non-empty quote body", () => {
	for (const sourceType of ["instagram", "tiktok", "youtube"] as const) {
		const result = buildRichMessage({
			baseHtml: "attribution",
			captionEnabled: true,
			media: [{ kind: "image", media: "photo-file" }],
			metadata: { text: "#tag1 #tag2", authorName: "Creator" },
			sourceType,
		});
		assertStringIncludes(
			result.html ?? "",
			"<blockquote expandable>#tag1 #tag2</blockquote>\n<p>",
		);
	}
});

Deno.test("all Postfetch providers put their icon and sender in the credit", () => {
	const providers = [
		["facebook", "5454340696183943190"],
		["instagram", "5454400924510334242"],
		["linkedin", "5454158271743012602"],
		["pinterest", "5467420297529401124"],
		["soundcloud", "5454046508104035795"],
		["tiktok", "5454351124364542651"],
		["twitter", "5334651953488080684"],
		["youtube", "5454010052421626926"],
		["youtubeVideo", "5454010052421626926"],
	] as const;

	for (const [sourceType, emojiId] of providers) {
		const result = buildRichMessage({
			baseHtml: "Sender shared this video",
			captionEnabled: true,
			media: [],
			metadata: {
				text: "Post body",
				authorName: "Display name",
				authorVerified: false,
			},
			sourceType,
		});
		assertStringIncludes(result.html ?? "", `emoji-id="${emojiId}"`);
		assertStringIncludes(result.html ?? "", "Sender shared this video");
		assertEquals(result.html?.includes("<cite>"), false);
		assertEquals(
			result.html?.includes("Display name"),
			sourceType === "twitter",
		);
		assertEquals(result.html?.includes("5951665890079544884"), false);
	}
});

Deno.test("author-only metadata renders sender attribution without a quote", () => {
	const result = buildRichMessage({
		baseHtml: "Sender shared this image",
		captionEnabled: true,
		media: [],
		metadata: { authorName: "Page name" },
		sourceType: "facebook",
	});
	assertEquals(
		result.html,
		'<p><tg-emoji emoji-id="5454340696183943190">📘</tg-emoji> Sender shared this image</p>',
	);
});

Deno.test("Reddit without a quote body renders facts above the sender", () => {
	const result = buildRichMessage({
		baseHtml: "Sender shared this image",
		captionEnabled: true,
		media: [{ kind: "image", media: "photo-file" }],
		metadata: {
			title: "Post title",
			subreddit: "pics",
			authorHandle: "post-author",
			likeCount: 10,
		},
		sourceType: "reddit",
	});
	assertEquals(
		result.html,
		'<h5>Post title</h5>\n<img src="tg://photo?id=media_0"/>\n<p><a href="https://www.reddit.com/r/pics">r/pics</a> <tg-emoji emoji-id="5875078273775439450">🔼</tg-emoji> 10</p>\n<p><tg-emoji emoji-id="5343641195484560502">👽</tg-emoji> Sender shared this image</p>',
	);
	assertEquals(result.html?.includes("post-author"), false);
});

Deno.test("non-X post author names and verification are omitted from credits", () => {
	const facebook = buildRichMessage({
		baseHtml: "Sender shared this image",
		captionEnabled: true,
		media: [],
		metadata: {
			text: "Post body",
			authorName: "Page name",
			authorVerified: true,
		},
		sourceType: "facebook",
	});
	assertEquals(facebook.html?.includes("Page name"), false);
	assertEquals(facebook.html?.includes("5951665890079544884"), false);
});

Deno.test("Twitter removes a t.co URL only when it ends the post", () => {
	assertEquals(stripTrailingTcoUrl("hello https://t.co/abc123"), "hello");
	assertEquals(
		stripTrailingTcoUrl("hello https://t.co/abc123 still here"),
		"hello https://t.co/abc123 still here",
	);
	assertEquals(
		stripTrailingTcoUrl("hellohttps://t.co/abc123"),
		"hellohttps://t.co/abc123",
	);

	const result = buildRichMessage({
		baseHtml: "Sender shared this image",
		captionEnabled: true,
		media: [{ kind: "image", media: "photo-file" }],
		metadata: { text: "hello https://t.co/abc123" },
		sourceType: "twitter",
	});
	assertEquals(
		result.html,
		'<p>hello</p>\n<img src="tg://photo?id=media_0"/>\n<p><tg-emoji emoji-id="5334651953488080684">🐦</tg-emoji> Sender shared this image</p>',
	);
});

Deno.test("X quote posts nest each author, text, and media", () => {
	const result = buildRichMessage({
		baseHtml:
			'<a href="tg://user?id=42">Sender</a> shared <a href="https://x.com/outer/status/100">this slider</a>',
		captionEnabled: true,
		media: [
			{ kind: "image", media: "outer-photo" },
			{ kind: "video", media: "quoted-video" },
		],
		metadata: {
			text: "Outer text https://t.co/quoted",
			authorName: "Outer Name",
			authorHandle: "outer",
			mediaCount: 1,
			quotedPost: {
				text: "Quoted text",
				authorName: "Quoted Name",
				authorHandle: "quoted",
				mediaCount: 1,
			},
		},
		sourceType: "twitter",
	});

	assertEquals(
		result.html,
		'<p><a href="https://x.com/outer"><b>Outer Name</b></a>: Outer text</p>\n<img src="tg://photo?id=media_0"/>\n<blockquote>\n<p><a href="https://x.com/quoted"><b>Quoted Name</b></a>: Quoted text</p>\n<video src="tg://video?id=media_1"/>\n</blockquote>\n<p><tg-emoji emoji-id="5334651953488080684">🐦</tg-emoji> <a href="tg://user?id=42">Sender</a> shared <a href="https://x.com/outer/status/100">this slider</a></p>',
	);
	assertEquals(result.html?.includes("@outer"), false);
	assertEquals(result.html?.includes("@quoted"), false);
	assertEquals(result.media, [
		{ id: "media_0", media: { type: "photo", media: "outer-photo" } },
		{
			id: "media_1",
			media: {
				type: "video",
				media: "quoted-video",
				supports_streaming: true,
			},
		},
	]);
});

Deno.test("disabled captions still embed media before the attribution", () => {
	const result = buildRichMessage({
		baseHtml: '<a href="https://example.com">post</a>',
		captionEnabled: false,
		media: [{ kind: "image", media: "photo-file" }],
		metadata: { text: "hidden caption" },
		sourceType: "instagram",
	});
	assertEquals(
		result.html,
		'<img src="tg://photo?id=media_0"/>\n<p><tg-emoji emoji-id="5454400924510334242">📸</tg-emoji> <a href="https://example.com">post</a></p>',
	);
	assertStringIncludes(result.html ?? "", "tg://photo?id=media_0");
});

Deno.test("sender attribution names only the media kind", async () => {
	const locale = JSON.parse(
		await Deno.readTextFile(new URL("../src/locales/en.json", import.meta.url)),
	) as { viewOn: Record<string, string> };
	const genericAttribution =
		'<a href="tg://user?id=${userId}">${userName}</a> shared <a href="${postUrl}">this ${kind}</a>';

	for (const sourceType of [
		"facebook",
		"instagram",
		"linkedin",
		"tiktok",
		"youtube",
		"twitter",
		"pinterest",
		"soundcloud",
		"reddit",
	]) {
		assertEquals(locale.viewOn[sourceType], genericAttribution);
	}
});
