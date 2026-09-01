import { assertEquals, assertStringIncludes } from "jsr:@std/assert@^1";

import {
	buildRichMessage,
	stripTrailingTcoUrl,
} from "../src/services/rich-message.ts";

Deno.test("reddit rich messages put an h5 title above a media slideshow", () => {
	const result = buildRichMessage({
		baseHtml: "unused attribution",
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
		'<h5>Seen in &lt;the UK&gt;</h5>\n<tg-slideshow><img src="tg://photo?id=media_0"/><video src="tg://video?id=media_1"/></tg-slideshow>\n<blockquote expandable>Post &lt;body&gt;<cite><tg-emoji emoji-id="5343641195484560502">👽</tg-emoji> <a href="https://www.reddit.com/r/pics">r/pics</a> · u/Gertrudethecurious<br><tg-emoji emoji-id="5875078273775439450">🔼</tg-emoji> 9,969 <tg-emoji emoji-id="5994297722574737553">💬</tg-emoji> 251</cite></blockquote>',
	);
	assertEquals(result.media, [
		{ id: "media_0", media: { type: "photo", media: "photo-file" } },
		{ id: "media_1", media: { type: "video", media: "video-file" } },
	]);
});

Deno.test("hashtags stay in the quote body and original authors become credit", () => {
	const result = buildRichMessage({
		baseHtml: "attribution",
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
		'<video src="tg://video?id=media_0"/>\n<blockquote expandable>blah &amp; more #tag1 #tag2<cite><tg-emoji emoji-id="5454400924510334242">📸</tg-emoji> Creator &lt;Name&gt; <tg-emoji emoji-id="5951665890079544884">✅</tg-emoji></cite></blockquote>\n<p>attribution</p>',
	);

	const tiktok = buildRichMessage({
		baseHtml: "attribution",
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
		'<video src="tg://video?id=media_0"/>\n<blockquote expandable>TikTok caption #fyp #video<cite><tg-emoji emoji-id="5454351124364542651">🎵</tg-emoji> creator</cite></blockquote>\n<p>attribution</p>',
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
			"<blockquote expandable>#tag1 #tag2<cite>",
		);
	}
});

Deno.test("all Postfetch providers use their requested author icon", () => {
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
			baseHtml: "attribution",
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
		assertStringIncludes(result.html ?? "", "Display name");
		assertEquals(result.html?.includes("5951665890079544884"), false);
	}
});

Deno.test("author-only metadata moves credit into the quote body", () => {
	const result = buildRichMessage({
		baseHtml: "attribution",
		captionEnabled: true,
		media: [],
		metadata: { authorName: "Page name" },
		sourceType: "facebook",
	});
	assertEquals(
		result.html,
		'<blockquote expandable><tg-emoji emoji-id="5454340696183943190">📘</tg-emoji> Page name</blockquote>\n<p>attribution</p>',
	);
});

Deno.test("verification is limited to providers that expose it", () => {
	const facebook = buildRichMessage({
		baseHtml: "attribution",
		captionEnabled: true,
		media: [],
		metadata: {
			text: "Post body",
			authorName: "Page name",
			authorVerified: true,
		},
		sourceType: "facebook",
	});
	assertEquals(facebook.html?.includes("5951665890079544884"), false);

	const twitter = buildRichMessage({
		baseHtml: "attribution",
		captionEnabled: true,
		media: [],
		metadata: {
			text: "Post body",
			authorName: "Account name",
			authorVerified: true,
		},
		sourceType: "twitter",
	});
	assertEquals(twitter.html?.includes("5951665890079544884"), true);
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
		baseHtml: "attribution",
		captionEnabled: true,
		media: [{ kind: "image", media: "photo-file" }],
		metadata: { text: "hello https://t.co/abc123" },
		sourceType: "twitter",
	});
	assertEquals(
		result.html,
		'<img src="tg://photo?id=media_0"/>\n<blockquote expandable>hello</blockquote>\n<p>attribution</p>',
	);
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
		'<img src="tg://photo?id=media_0"/>\n<p><a href="https://example.com">post</a></p>',
	);
	assertStringIncludes(result.html ?? "", "tg://photo?id=media_0");
});
