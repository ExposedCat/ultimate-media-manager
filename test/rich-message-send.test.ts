import { assertEquals, assertRejects } from "jsr:@std/assert@^1";
import { sendRichMessageWithFallback } from "../src/services/rich-message-send.ts";
import {
	type RichMessageData,
	buildRichMessage,
} from "../src/services/rich-message.ts";

for (const sourceType of ["twitter", "reddit"] as const) {
	Deno.test(`${sourceType} send retries preserve the post and stop at the first successful reduction`, async () => {
		for (const failures of [0, 1, 2, 3, 4]) {
			const original: RichMessageData<string> = {
				sourceType,
				baseHtml: "Sender shared this post with comments",
				baseHtmlWithoutComments: "Sender shared this post",
				captionEnabled: true,
				media: [
					{ kind: "image", media: "root" },
					{ kind: "video", media: "quote-or-root" },
					{ kind: "image", media: "last-comment" },
				],
				metadata: {
					text: "Root text",
					mediaCount: sourceType === "twitter" ? 1 : 2,
					...(sourceType === "twitter" && {
						quotedPost: { text: "Quoted text", mediaCount: 1 },
					}),
					comments: Array.from({ length: 20 }, (_, i) => ({
						text: `Comment ${i + 1}`,
						mediaCount: i === 19 ? 1 : 0,
					})),
				},
			};
			const snapshot = structuredClone(original);
			const counts: number[] = [];
			const sent = await sendRichMessageWithFallback(original, async (data) => {
				const count = data.metadata?.comments?.length ?? 0;
				counts.push(count);
				assertEquals(data.captionEnabled, true);
				assertEquals(data.metadata?.text, "Root text");
				assertEquals(data.metadata?.quotedPost, original.metadata?.quotedPost);
				assertEquals(
					data.metadata?.comments,
					original.metadata?.comments?.slice(0, count),
				);
				assertEquals(
					data.media.map((item) => item.media),
					count === 20
						? ["root", "quote-or-root", "last-comment"]
						: ["root", "quote-or-root"],
				);
				const message = buildRichMessage(data);
				assertEquals(message.html?.includes("with comments"), count > 0);
				assertEquals(message.html?.includes("Root text"), true);
				if (counts.length <= failures) {
					throw {
						error_code: 400,
						description: "Bad Request: can't parse entities",
					};
				}
				return "sent";
			});
			assertEquals(sent, "sent");
			assertEquals(counts, [20, 19, 18, 10, 0].slice(0, failures + 1));
			assertEquals(original, snapshot);
		}
	});
}

Deno.test("comment retries round down, skip duplicate counts and propagate the last send error", async () => {
	for (const [count, expected] of [
		[10, [10, 9, 5, 0]],
		[1, [1, 0]],
		[0, [0]],
	] as const) {
		const counts: number[] = [];
		await assertRejects(
			() =>
				sendRichMessageWithFallback(
					{
						sourceType: "twitter",
						baseHtml: "Sender",
						captionEnabled: false,
						media: [],
						metadata: {
							comments: Array.from({ length: count }, () => ({
								text: "reply",
							})),
						},
					},
					async (data) => {
						counts.push(data.metadata?.comments?.length ?? 0);
						const error = new Error(`send failed at ${counts.at(-1)} comments`);
						throw Object.assign(error, {
							error_code: 400,
							description: "Bad Request: can't parse entities",
						});
					},
				),
			Error,
			"send failed at 0 comments",
		);
		assertEquals(counts, [...expected]);
	}
});

Deno.test("comment fallback never resends after uncertain delivery or unrelated rejections", async () => {
	for (const error of [
		{ error_code: 504, description: "Gateway Timeout" },
		{ error_code: 500, description: "Internal Server Error" },
		{ error_code: 403, description: "Forbidden" },
		{ error_code: 429, description: "Too Many Requests" },
		{ error_code: 400, description: "Bad Request: VIDEO_FILE_INVALID" },
		new Error("Network request failed"),
	]) {
		let attempts = 0;
		let caught: unknown;
		try {
			await sendRichMessageWithFallback(
				{
					sourceType: "twitter",
					baseHtml: "Sender",
					captionEnabled: true,
					media: [{ kind: "video", media: "video" }],
					metadata: {
						comments: Array.from({ length: 20 }, () => ({ text: "reply" })),
					},
				},
				async () => {
					attempts++;
					throw error;
				},
			);
		} catch (error) {
			caught = error;
		}
		assertEquals(caught, error);
		assertEquals(attempts, 1);
	}
});
