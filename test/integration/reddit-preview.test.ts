import { assertEquals, assertStringIncludes } from "jsr:@std/assert@^1";
import type { PostfetchResult } from "@postfetch/core";
import {
	downloadWithPostfetch,
	toCaptionMeta,
} from "../../src/services/postfetch.ts";
import {
	buildRichMessage,
	selectRichMessageComments,
} from "../../src/services/rich-message.ts";

const id = "1xhu3b0";
const preview =
	"https://external-preview.redd.it/studio.jpg?auto=webp&s=signature";
const result: PostfetchResult = {
	platform: "reddit",
	id,
	archiveFilename: `reddit_${id}.zip`,
	items: [
		{
			id,
			platform: "reddit",
			kind: "image",
			mime: "image/jpeg",
			filename: `reddit_${id}_preview.jpg`,
			headers: {},
			role: "linkPreview",
			url: preview,
		},
	],
	metadata: {
		title: "Mac Studio M5 Ultra 512gb Starts at $22,299.00 USD",
		text: "Post body",
		extra: { subreddit: "LocalLLaMA" },
	},
	comments: [],
};

Deno.test("UMM resolves Reddit website previews, downloads them and retains their layout metadata", async () => {
	const original = globalThis.fetch;
	const requests: string[] = [];
	globalThis.fetch = (input, init) => {
		const url = String(input);
		if (url === "https://www.reddit.com/api/v1/access_token")
			return Promise.resolve(Response.json({ access_token: "test-token" }));
		if (url === `https://oauth.reddit.com/comments/${id}?raw_json=1&limit=1`)
			return Promise.resolve(
				Response.json([
					{
						data: {
							children: [
								{
									data: {
										id,
										title: result.metadata?.title,
										selftext: "Post body",
										subreddit: "LocalLLaMA",
										post_hint: "link",
										url: "https://www.apple.com/shop/buy-mac/mac-studio",
										preview: {
											enabled: false,
											images: [{ source: { url: preview } }],
										},
									},
								},
							],
						},
					},
				]),
			);
		if (url !== preview) throw new Error(`Unexpected URL: ${url}`);
		if (init?.method !== "HEAD") requests.push(url);
		return Promise.resolve(
			new Response(
				init?.method === "HEAD" ? null : Uint8Array.of(255, 216, 255, 217),
				{ headers: { "content-length": "4", "content-type": "image/jpeg" } },
			),
		);
	};
	try {
		const downloaded = await downloadWithPostfetch(
			`https://www.reddit.com/r/LocalLLaMA/comments/${id}/mac_studio_m5_ultra_512gb_starts_at_2229900_usd/`,
		);
		if (downloaded?.type !== "single")
			throw new Error("Expected downloaded Reddit preview");
		assertEquals(requests, [preview]);
		assertEquals(downloaded.file.filename, `reddit_${id}_preview.jpg`);
		assertEquals(downloaded.file.data, Uint8Array.of(255, 216, 255, 217));
		const metadata = downloaded.metadata;
		assertEquals(metadata?.mediaCount, 1);
		assertEquals(metadata?.linkPreviewCount, 1);
		const rich = buildRichMessage({
			baseHtml: "Sender",
			captionEnabled: true,
			sourceType: "reddit",
			metadata,
			media: [{ kind: "image", media: "preview-file-id" }],
		});
		assertStringIncludes(rich.html ?? "", `<h5>${result.metadata?.title}</h5>`);
		assertStringIncludes(
			rich.html ?? "",
			'<blockquote expandable>Post body</blockquote>\n<img src="tg://photo?id=media_0"/>',
		);
		assertEquals(rich.media?.length, 1);
	} finally {
		globalThis.fetch = original;
	}
});

for (const captionEnabled of [true, false]) {
	Deno.test(`Reddit previews stay outside galleries and comment media with captions ${captionEnabled}`, () => {
		const data = {
			baseHtml: "Sender with comments",
			baseHtmlWithoutComments: "Sender",
			captionEnabled,
			sourceType: "reddit" as const,
			metadata: {
				...toCaptionMeta(result),
				mediaCount: 3,
				comments: [{ text: "Comment", mediaCount: 1 }],
			},
			media: ["photo", "photo2", "preview", "comment"].map((media) => ({
				kind: "image" as const,
				media,
			})),
		};
		for (const comments of [0, 1]) {
			const rich = buildRichMessage(selectRichMessageComments(data, comments));
			const html = rich.html ?? "";
			assertStringIncludes(
				html,
				'<tg-slideshow><img src="tg://photo?id=media_0"/><img src="tg://photo?id=media_1"/></tg-slideshow>',
			);
			assertStringIncludes(html, "</tg-slideshow>\n");
			assertStringIncludes(html, '<img src="tg://photo?id=media_2"/>');
			assertEquals(html.includes("Post body"), captionEnabled);
			assertEquals(html.includes("Comment"), comments > 0);
			assertEquals(rich.media?.length, 3 + comments);
			assertEquals((html.match(/<tg-slideshow>/g) ?? []).length, 1);
			if (captionEnabled)
				assertStringIncludes(
					html,
					'</blockquote>\n<img src="tg://photo?id=media_2"/>',
				);
		}
	});
}
