import { assertEquals } from "jsr:@std/assert@^1";

import { renderMarkdownLinks } from "../src/helpers/markdown.ts";

Deno.test("renders Markdown web links as safe Telegram HTML", () => {
	assertEquals(
		renderMarkdownLinks(
			'See [this <post>](https://example.com/watch?a=1&b=2) & "enjoy"',
		),
		'See <a href="https://example.com/watch?a=1&amp;b=2">this &lt;post&gt;</a> &amp; &quot;enjoy&quot;',
	);
});

Deno.test("supports balanced parentheses and escaped Markdown punctuation", () => {
	assertEquals(
		renderMarkdownLinks(
			"Read [the \\[docs\\]](https://example.com/a_(b\\))) now",
		),
		'Read <a href="https://example.com/a_(b))">the [docs]</a> now',
	);
});

Deno.test("leaves malformed and unsafe Markdown links as escaped text", () => {
	assertEquals(
		renderMarkdownLinks(
			"[unsafe](javascript:alert(1)) [relative](/page) [broken](https://example.com",
		),
		"[unsafe](javascript:alert(1)) [relative](/page) [broken](https://example.com",
	);
});
