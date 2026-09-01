import { assertEquals } from "jsr:@std/assert@^1";

import {
	deleteCachedMedia,
	setCachedMedia,
} from "../src/services/media-file-cache.ts";
import { downloadPlainMatchedUrl } from "../src/services/url-download.ts";
import type { CustomContext } from "../src/types/context.ts";

const twitterMatch = {
	type: "twitter" as const,
	match: /x\.com/,
};

function plainContext(overrides: Record<string, unknown>) {
	return {
		from: { id: 42, first_name: "Plain" },
		telemetry: { event() {} },
		...overrides,
	} as unknown as CustomContext;
}

Deno.test("plain download sends a cached image without rich text or captions", async () => {
	const url = "https://x.com/example/status/plain-image";
	setCachedMedia(url, { kind: "image", fileId: "cached-photo" });
	const calls: unknown[] = [];

	try {
		const sent = await downloadPlainMatchedUrl(
			plainContext({
				replyWithPhoto(media: unknown, extra: unknown) {
					calls.push({ method: "photo", media, extra });
					return { photo: [{ file_id: "cached-photo" }] };
				},
			}),
			url,
			twitterMatch,
		);

		assertEquals(sent, true);
		assertEquals(calls, [
			{ method: "photo", media: "cached-photo", extra: {} },
		]);
	} finally {
		deleteCachedMedia(url);
	}
});

Deno.test("plain download sends cached galleries as captionless media groups", async () => {
	const url = "https://x.com/example/status/plain-gallery";
	setCachedMedia(url, {
		kind: "images",
		items: [
			{ kind: "image", fileId: "cached-photo" },
			{ kind: "video", fileId: "cached-video" },
		],
	});
	const calls: unknown[] = [];

	try {
		const sent = await downloadPlainMatchedUrl(
			plainContext({
				replyWithMediaGroup(media: unknown, extra: unknown) {
					calls.push({ method: "mediaGroup", media, extra });
					return [
						{ photo: [{ file_id: "cached-photo" }] },
						{ video: { file_id: "cached-video" } },
					];
				},
			}),
			url,
			twitterMatch,
		);

		assertEquals(sent, true);
		assertEquals(calls, [
			{
				method: "mediaGroup",
				media: [
					{ type: "photo", media: "cached-photo" },
					{ type: "video", media: "cached-video" },
				],
				extra: {},
			},
		]);
	} finally {
		deleteCachedMedia(url);
	}
});
