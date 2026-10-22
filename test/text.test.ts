import { assertEquals } from "jsr:@std/assert@^1";

import { sliceUtf16, truncateText } from "../src/helpers/text.ts";

function hasLoneSurrogate(text: string) {
	return !text.isWellFormed();
}

Deno.test("sliceUtf16 does not split a surrogate pair at the limit", () => {
	const prefix =
		"Republican leader embarrassed by Ali G film says he plans to sue Sacha Baron Cohen: ‘A liar and a pervert’\nr/politics 🔼 1,689 ";
	const text = `${prefix}💬 512`;
	const sliced = sliceUtf16(text, prefix.length + 1);

	assertEquals(sliced, prefix);
	assertEquals(hasLoneSurrogate(sliced), false);
});

Deno.test("sliceUtf16 keeps complete pairs and short strings intact", () => {
	assertEquals(sliceUtf16("a💬b", 3), "a💬");
	assertEquals(sliceUtf16("a💬", 10), "a💬");
	assertEquals(sliceUtf16("💬", 1), "");
	assertEquals(sliceUtf16("abc", 0), "");
});

Deno.test("truncateText never leaves a lone surrogate before the ellipsis", () => {
	for (let max = 2; max < 12; max++) {
		const result = truncateText("ab💬cd🔼ef😢gh", max);
		assertEquals(hasLoneSurrogate(result), false, `max=${max}: ${result}`);
	}
});
