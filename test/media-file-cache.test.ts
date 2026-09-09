import { assertEquals } from "jsr:@std/assert@^1";

import {
	deleteCachedMedia,
	getCachedMedia,
	getCachedMediaFromRichMessage,
	setCachedMedia,
} from "../src/services/media-file-cache.ts";

Deno.test("slideshow cache entries are isolated by delay and off mode", () => {
	const url = "https://www.tiktok.com/@test/photo/123/";
	try {
		for (const delay of [0, 1, 10]) {
			setCachedMedia(
				url,
				{ kind: delay === 0 ? "image" : "video", fileId: `delay-${delay}` },
				delay,
			);
		}
		for (const delay of [0, 1, 10]) {
			assertEquals(getCachedMedia(url.slice(0, -1), delay), {
				kind: delay === 0 ? "image" : "video",
				fileId: `delay-${delay}`,
			});
		}
		assertEquals(getCachedMedia(url, 5), null);
		deleteCachedMedia(url, 1);
		assertEquals(getCachedMedia(url, 1), null);
		assertEquals(getCachedMedia(url, 10)?.kind, "video");
	} finally {
		for (const delay of [0, 1, 10]) deleteCachedMedia(url, delay);
	}
});

Deno.test("extracts cached file IDs from a rich slideshow", () => {
	assertEquals(
		getCachedMediaFromRichMessage({
			rich_message: {
				blocks: [
					{ type: "heading" },
					{
						type: "slideshow",
						blocks: [
							{
								type: "photo",
								photo: [{ file_id: "small" }, { file_id: "large" }],
							},
							{ type: "video", video: { file_id: "video" } },
						],
					},
				],
			},
		}),
		{
			kind: "images",
			items: [
				{ kind: "image", fileId: "large" },
				{ kind: "video", fileId: "video" },
			],
		},
	);
});

Deno.test("preserves media order through nested quotations", () => {
	assertEquals(
		getCachedMediaFromRichMessage({
			rich_message: {
				blocks: [
					{
						type: "blockquote",
						blocks: [
							{ type: "photo", photo: [{ file_id: "outer-photo" }] },
							{
								type: "blockquote",
								blocks: [
									{
										type: "video",
										video: { file_id: "quoted-video" },
									},
								],
							},
						],
					},
				],
			},
		}),
		{
			kind: "images",
			items: [
				{ kind: "image", fileId: "outer-photo" },
				{ kind: "video", fileId: "quoted-video" },
			],
		},
	);
});
