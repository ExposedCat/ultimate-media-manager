import { assertEquals } from "jsr:@std/assert@^1";
import { commentSections } from "../src/services/comment-sections.ts";
import { replyLimitAfterUrl } from "../src/services/context-message.ts";

Deno.test("comment groups honor the examples, oversized text and media boundaries", () => {
	const group = (lengths: number[], mediaAt = -1) =>
		commentSections(
			lengths.map((length, i) => ({
				text: "x".repeat(length),
				mediaCount: i === mediaAt ? 1 : 0,
			})),
			(c) => c,
		).map((section) => section.map((c) => c.text.length));
	assertEquals(group([250, 250, 250]), [[250, 250, 250]]);
	assertEquals(group([250, 250, 500]), [[250, 250], [500]]);
	assertEquals(group([10000, 1]), [[10000], [1]]);
	assertEquals(group([100, 100, 100], 1), [[100], [100], [100]]);
	assertEquals(group(Array(11).fill(751)).length, 10);
	assertEquals(group([750, 1]), [[750], [1]]);
});

Deno.test("link message counts include the post and support punctuation, captions, and text links", () => {
	const url = "https://x.com/paularambles/status/2097547797444911520?s=20";
	assertEquals(
		replyLimitAfterUrl({ text: `Check this: ${url} 5, cool?` }, url),
		4,
	);
	assertEquals(replyLimitAfterUrl({ caption: `${url} 12` }, url), 11);
	assertEquals(
		replyLimitAfterUrl(
			{
				text: "😀 click 3!",
				entities: [{ type: "text_link", offset: 3, length: 5, url }],
			},
			url,
		),
		2,
	);
	const other = "https://x.com/other/status/123";
	const message = { text: `${url} 5 and ${other} 2` };
	assertEquals(replyLimitAfterUrl(message, url), 4);
	assertEquals(replyLimitAfterUrl(message, other), 1);
	for (const suffix of [
		"",
		" 0",
		" 1",
		" later 5",
		" -2",
		" 1.5",
		" 5abc",
		" 1e3",
		" 999999999999999999999",
	]) {
		assertEquals(replyLimitAfterUrl({ text: url + suffix }, url), 0);
	}
});
