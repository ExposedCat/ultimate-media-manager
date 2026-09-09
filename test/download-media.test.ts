import { assertEquals, assertStringIncludes } from "jsr:@std/assert@^1";

import { downloadMediaForUrl } from "../src/services/download-media.ts";

async function withPostfetchResponse(
	tweet: object,
	mediaStatus: number,
	check: () => Promise<void>,
) {
	const originalFetch = globalThis.fetch;
	const commandDescriptor = Object.getOwnPropertyDescriptor(Deno, "Command");
	let commands = 0;
	globalThis.fetch = (input) => {
		if (String(input).includes("cdn.syndication.twimg.com")) {
			return Promise.resolve(Response.json(tweet));
		}
		return Promise.resolve(
			new Response(Uint8Array.of(0xff, 0xd8, 0xff, 0xd9), {
				status: mediaStatus,
				headers: { "content-length": "4" },
			}),
		);
	};
	Object.defineProperty(Deno, "Command", {
		configurable: true,
		value: class {
			constructor() {
				commands++;
				throw new Error("Unexpected external downloader");
			}
		},
	});
	try {
		await check();
		assertEquals(commands, 0);
	} finally {
		globalThis.fetch = originalFetch;
		if (commandDescriptor) {
			Object.defineProperty(Deno, "Command", commandDescriptor);
		}
	}
}

const photoPost = {
	text: "A photo",
	mediaDetails: [
		{ type: "photo", media_url_https: "https://pbs.twimg.com/test.jpg" },
	],
};

Deno.test("Postfetch failures are returned without invoking an external downloader", async () => {
	await withPostfetchResponse(photoPost, 403, async () => {
		const result = await downloadMediaForUrl(
			"https://x.com/example/status/123",
		);
		assertEquals(result.media, null);
		assertStringIncludes(result.error ?? "", "download failed: 403");
	});
});

Deno.test("Postfetch images retain their bytes and metadata", async () => {
	await withPostfetchResponse(photoPost, 200, async () => {
		const result = await downloadMediaForUrl(
			"https://x.com/example/status/123",
		);
		assertEquals(result.media?.kind, "image");
		if (result.media?.kind !== "image") throw new Error("Expected an image");
		assertEquals(result.media.bytes, Uint8Array.of(0xff, 0xd8, 0xff, 0xd9));
		assertEquals(result.media.metadata?.text, "A photo");
	});
});

Deno.test("Postfetch text posts retain metadata without attempting another downloader", async () => {
	await withPostfetchResponse({ text: "A text post" }, 200, async () => {
		const result = await downloadMediaForUrl(
			"https://x.com/example/status/123",
		);
		assertEquals(result.media, null);
		assertEquals(result.metadata?.text, "A text post");
		assertEquals(result.error, undefined);
	});
});
