import { assertEquals, assertStringIncludes } from "jsr:@std/assert@^1";
import type { InputRichMessage } from "grammy/types";
import {
	deleteCachedMedia,
	getCachedMedia,
	setCachedMedia,
} from "../../src/services/media-file-cache.ts";
import { downloadWithPostfetch } from "../../src/services/postfetch.ts";
import { downloadMatchedUrl } from "../../src/services/url-download.ts";
import type { CustomContext } from "../../src/types/context.ts";

const id = "2097547797444911520";
const url = `https://x.com/paularambles/status/${id}?s=20`;
const reply = (n: number, text = `reply-${n}`, media = false) => ({
	id: String(n),
	text,
	author: { screen_name: `reader${n}` },
	replying_to: { status: id },
	media: {
		all: media
			? [
					{ type: "photo", url: `https://pbs.twimg.com/comment-${n}.jpg` },
					{ type: "photo", url: `https://pbs.twimg.com/unused-${n}.jpg` },
				]
			: [],
	},
});

async function withResponses(
	replies: unknown[],
	run: (requests: string[]) => Promise<void>,
	failure?: "lookup" | "media",
) {
	const original = globalThis.fetch;
	const requests: string[] = [];
	globalThis.fetch = (input) => {
		const target = String(input);
		requests.push(target);
		if (target.includes("syndication"))
			return Promise.resolve(Response.json({ id_str: id, text: "Root text" }));
		if (target.includes("/2/conversation/"))
			return Promise.resolve(
				failure === "lookup"
					? new Response(null, { status: 503 })
					: Response.json({ code: 200, replies }),
			);
		if (target.includes("pbs.twimg.com"))
			return Promise.resolve(
				new Response(Uint8Array.of(255, 216, 255, 217), {
					status: failure === "media" ? 403 : 200,
				}),
			);
		throw new Error(`Unexpected URL: ${target}`);
	};
	try {
		await run(requests);
	} finally {
		globalThis.fetch = original;
	}
}

Deno.test("UMM parses the link count, bypasses the root cache, downloads reply media and renders comments", async () => {
	const sent: InputRichMessage[] = [];
	setCachedMedia(url, { kind: "image", fileId: "old-root-cache" });
	try {
		await withResponses(
			[
				reply(1, "a".repeat(250)),
				reply(2, "b".repeat(250)),
				reply(3, "with photo", true),
				reply(4, "d".repeat(10000)),
				reply(5),
				reply(6),
			],
			async (requests) => {
				const ctx = {
					from: { id: 42, first_name: "Tester" },
					telemetry: { event() {} },
					msg: { text: `Check this: ${url} 5, cool?` },
					i18n: { t: () => "Sender" },
					replyWithRichMessage(message: InputRichMessage) {
						sent.push(message);
						return {};
					},
				} as unknown as CustomContext;
				assertEquals(await downloadMatchedUrl(ctx, url), true);
				assertEquals(sent.length, 1);
				const html = sent[0].html ?? "";
				assertStringIncludes(html, "Show comments");
				assertStringIncludes(html, "d".repeat(10000));
				assertStringIncludes(html, "reply-5");
				assertEquals(html.includes("reply-6"), false);
				assertEquals(sent[0].media?.length, 1);
				assertEquals(
					requests.some((request) => request.includes("comment-3.jpg")),
					true,
				);
				assertEquals(
					requests.some((request) => request.includes("unused-3.jpg")),
					false,
				);
				assertEquals(getCachedMedia(url), {
					kind: "image",
					fileId: "old-root-cache",
				});
			},
		);
	} finally {
		deleteCachedMedia(url);
	}
});

Deno.test("UMM drops overflow before downloading attachments", async () => {
	await withResponses(
		Array.from({ length: 20 }, (_, i) => reply(i + 1, `reply-${i + 1}`, true)),
		async (requests) => {
			const result = await downloadWithPostfetch(url, { comments: 20 });
			assertEquals(result?.metadata?.comments?.length, 13);
			assertEquals(
				requests.filter((request) => request.includes("pbs.twimg.com")).length,
				13,
			);
		},
	);
});

for (const failure of ["lookup", "media"] as const) {
	Deno.test(`UMM returns no comments and keeps the root on ${failure} failure`, async () => {
		await withResponses(
			[reply(1, "photo", true)],
			async () => {
				const result = await downloadWithPostfetch(url, { comments: 5 });
				assertEquals(result?.type, "text");
				assertEquals(result?.metadata?.text, "Root text");
				assertEquals(result?.metadata?.comments, []);
			},
			failure,
		);
	});
}

Deno.test("UMM accepts fewer comments than requested", async () => {
	await withResponses([reply(1)], async () => {
		const result = await downloadWithPostfetch(url, { comments: 10 });
		assertEquals(result?.metadata?.comments?.length, 1);
	});
});
