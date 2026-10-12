import { assertEquals } from "jsr:@std/assert@^1";

import { renderMarkdown } from "../src/helpers/markdown.ts";

Deno.test("renders Markdown web links as safe Telegram HTML", () => {
	assertEquals(
		renderMarkdown(
			'See [this <post>](https://example.com/watch?a=1&b=2) & "enjoy"',
		),
		'See <a href="https://example.com/watch?a=1&amp;b=2">this &lt;post&gt;</a> &amp; &quot;enjoy&quot;',
	);
});

Deno.test("supports balanced parentheses and escaped Markdown punctuation", () => {
	assertEquals(
		renderMarkdown("Read [the \\[docs\\]](https://example.com/a_(b\\))) now"),
		'Read <a href="https://example.com/a_(b))">the [docs]</a> now',
	);
});

Deno.test("leaves malformed and unsafe Markdown links as escaped text", () => {
	assertEquals(
		renderMarkdown(
			"[unsafe](javascript:alert(1)) [relative](/page) [broken](https://example.com",
		),
		"[unsafe](javascript:alert(1)) [relative](/page) [broken](https://example.com",
	);
});

Deno.test("renders nested emphasis and leaves unmatched markers literal", () => {
	assertEquals(
		renderMarkdown("**bold *italic*** and *italic **bold***, **open"),
		"<b>bold <i>italic</i></b> and <i>italic <b>bold</b></i>, **open",
	);
});

Deno.test("escapes code without interpreting its Markdown", () => {
	assertEquals(
		renderMarkdown("`**<b>&**`\n\n```js\n*literal* <b>&\n```\nend"),
		"<code>**&lt;b&gt;&amp;**</code>\n\n<pre>*literal* &lt;b&gt;&amp;</pre>\nend",
	);
});

Deno.test("escapes HTML and retains unsupported block and image syntax", () => {
	assertEquals(
		renderMarkdown(
			"# Title\n\n- **item**\n\n![image](https://example.com/a)\n<b>raw</b>",
		),
		"# Title\n\n- <b>item</b>\n\n![image](https://example.com/a)\n&lt;b&gt;raw&lt;/b&gt;",
	);
});

Deno.test("preserves line breaks and escapes text inside formatted links", () => {
	assertEquals(
		renderMarkdown(
			"first\n\n[*<label>*](https://example.com/?a=1&b=2)\nlast\n",
		),
		'first\n\n<a href="https://example.com/?a=1&amp;b=2"><i>&lt;label&gt;</i></a>\nlast\n',
	);
});
