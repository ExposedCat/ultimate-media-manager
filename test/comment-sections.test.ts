import { assertEquals } from "jsr:@std/assert@^1";
import { commentSections } from "../src/services/comment-sections.ts";
import { commentsAfterUrl } from "../src/services/context-message.ts";

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
	assertEquals(group(Array(14).fill(751)).length, 13);
	assertEquals(group([750, 1]), [[750], [1]]);
});

Deno.test("link comment counts support punctuation, captions, text links, and independent URLs", () => {
	const url = "https://x.com/paularambles/status/2097547797444911520?s=20";
	assertEquals(
		commentsAfterUrl({ text: `Check this: ${url} 5, cool?` }, url),
		5,
	);
	assertEquals(commentsAfterUrl({ caption: `${url} 12` }, url), 12);
	assertEquals(
		commentsAfterUrl(
			{
				text: "😀 click 3!",
				entities: [{ type: "text_link", offset: 3, length: 5, url }],
			},
			url,
		),
		3,
	);
	const other = "https://x.com/other/status/123";
	const message = { text: `${url} 5 and ${other} 2` };
	assertEquals(commentsAfterUrl(message, url), 5);
	assertEquals(commentsAfterUrl(message, other), 2);
	for (const suffix of [
		"",
		" later 5",
		" -2",
		" 1.5",
		" 5abc",
		" 1e3",
		" 999999999999999999999",
	]) {
		assertEquals(commentsAfterUrl({ text: url + suffix }, url), 0);
	}
});
