import { assertEquals } from "jsr:@std/assert@^1";

import { matchInput } from "../src/services/sources.ts";

Deno.test("matches Facebook text post URLs", () => {
	for (const url of [
		"https://www.facebook.com/Engineering/posts/1091181673044313/",
		"https://www.facebook.com/permalink.php?story_fbid=123&id=456",
		"https://www.facebook.com/story.php?story_fbid=123&id=456",
	]) {
		assertEquals(matchInput(url).type, "facebook");
	}
});

Deno.test("matches X text post URLs", () => {
	assertEquals(
		matchInput("https://x.com/thsottiaux/status/2095651088502591861").type,
		"twitter",
	);
});
