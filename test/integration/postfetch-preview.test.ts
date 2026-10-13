import { assertEquals, assertStringIncludes } from "jsr:@std/assert@^1";
import { downloadWithPostfetch } from "../../src/services/postfetch.ts";
import {
	buildRichMessage,
	selectRichMessageComments,
} from "../../src/services/rich-message.ts";

const id = "2109709413032546346";
const preview = "https://pbs.twimg.com/card_img/chart?format=jpg&name=orig";
const card = {
	name: "summary_large_image",
	binding_values: {
		photo_image_full_size_original: {
			type: "IMAGE",
			image_value: { url: preview, width: 2400, height: 2340 },
		},
	},
};

Deno.test("UMM downloads a website preview and renders it below the reply text", async () => {
	const original = globalThis.fetch;
	const downloads: string[] = [];
	globalThis.fetch = (input, init) => {
		const url = String(input);
		if (url.includes("syndication"))
			return Promise.resolve(
				Response.json({
					id_str: id,
					text: "Dive in and enjoy. https://t.co/site",
					card,
					parent: { id_str: "90", text: "Parent", card },
				}),
			);
		if (url === preview) {
			if (init?.method !== "HEAD") downloads.push(url);
			return Promise.resolve(
				new Response(
					init?.method === "HEAD" ? null : Uint8Array.of(255, 216, 255, 217),
					{
						headers: { "content-type": "image/jpeg", "content-length": "4" },
					},
				),
			);
		}
		throw new Error(`Unexpected URL: ${url}`);
	};
	try {
		const result = await downloadWithPostfetch(
			`https://x.com/morganlinton/status/${id}`,
		);
		assertEquals(result?.type, "single");
		if (result?.type !== "single")
			throw new Error("Expected downloaded preview");
		assertEquals(result.file.filename, `twitter_${id}_preview.jpg`);
		assertEquals(result.file.data, Uint8Array.of(255, 216, 255, 217));
		assertEquals(downloads, [preview]);
		assertEquals(result.metadata?.linkPreviewCount, 1);
		assertEquals(result.metadata?.parentPost?.mediaCount, 0);
		const rich = buildRichMessage({
			baseHtml: "Sender",
			captionEnabled: true,
			sourceType: "twitter",
			metadata: result.metadata,
			media: [{ kind: "image", media: "preview-file-id" }],
		});
		assertStringIncludes(
			rich.html ?? "",
			'Dive in and enjoy. https://t.co/site</p>\n<img src="tg://photo?id=media_0"/>',
		);
		assertEquals(rich.media?.length, 1);
	} finally {
		globalThis.fetch = original;
	}
});

for (const captionEnabled of [true, false]) {
	Deno.test(`UMM separates previews from galleries and retains quote/comment ownership with captions ${captionEnabled}`, async () => {
		const original = globalThis.fetch;
		globalThis.fetch = (input, init) => {
			const url = String(input);
			if (url.includes("syndication"))
				return Promise.resolve(
					Response.json({
						id_str: id,
						text: "Root",
						card,
						mediaDetails: [1, 2].map((n) => ({
							type: "photo",
							media_url_https: `https://pbs.twimg.com/root${n}.jpg`,
						})),
						quoted_tweet: { id_str: "90", text: "Quote", card },
					}),
				);
			if (url.includes("/2/conversation/"))
				return Promise.resolve(
					Response.json({
						code: 200,
						replies: [
							{
								id: "80",
								text: "Comment",
								replying_to: { status: id },
								media: {
									all: [
										{ type: "photo", url: "https://pbs.twimg.com/comment.jpg" },
									],
								},
							},
						],
					}),
				);
			if (url.startsWith("https://pbs.twimg.com/"))
				return Promise.resolve(
					new Response(
						init?.method === "HEAD" ? null : Uint8Array.of(255, 216, 255, 217),
						{ headers: { "content-length": "4" } },
					),
				);
			throw new Error(`Unexpected URL: ${url}`);
		};
		try {
			const result = await downloadWithPostfetch(
				`https://x.com/example/status/${id}`,
				{ comments: 1 },
			);
			if (result?.type !== "multiple")
				throw new Error("Expected attachments and previews");
			assertEquals(
				result.files.map((file) => file.filename),
				[
					`twitter_${id}_1.jpg`,
					`twitter_${id}_2.jpg`,
					"twitter_90_preview.jpg",
					`twitter_${id}_preview.jpg`,
					"twitter_80_1.jpg",
				],
			);
			assertEquals(result.metadata?.mediaCount, 3);
			assertEquals(result.metadata?.linkPreviewCount, 1);
			assertEquals(result.metadata?.quotedPost?.linkPreviewCount, 1);
			// File-id reuse follows the same order as fresh uploads and rendered blocks.
			const data = {
				baseHtml: "Sender",
				captionEnabled,
				sourceType: "twitter" as const,
				metadata: result.metadata,
				media: result.files.map((file) => ({
					kind: "image" as const,
					media: file.filename,
				})),
			};
			const rich = buildRichMessage(data);
			const html = rich.html ?? "";
			assertStringIncludes(
				html,
				'<tg-slideshow><img src="tg://photo?id=media_0"/><img src="tg://photo?id=media_1"/></tg-slideshow>',
			);
			assertEquals(
				[...html.matchAll(/id=media_(\d+)/g)].map((match) => match[1]),
				["0", "1", "2", "3", "4"],
			);
			assertEquals((html.match(/<tg-slideshow>/g) ?? []).length, 1);
			if (captionEnabled)
				assertStringIncludes(
					html,
					'</blockquote>\n<img src="tg://photo?id=media_3"/>',
				);
			assertEquals(html.includes("Root"), captionEnabled);
			const withoutComments = buildRichMessage(
				selectRichMessageComments(data, 0),
			);
			assertEquals(withoutComments.media?.length, 4);
			assertStringIncludes(withoutComments.html ?? "", "id=media_3");
			assertEquals(withoutComments.html?.includes("Comment"), false);
		} finally {
			globalThis.fetch = original;
		}
	});
}
