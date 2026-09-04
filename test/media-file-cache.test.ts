import { assertEquals } from "jsr:@std/assert@^1";

import { getCachedMediaFromRichMessage } from "../src/services/media-file-cache.ts";

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
