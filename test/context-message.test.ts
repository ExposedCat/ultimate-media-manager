import { assertEquals, assertStrictEquals } from "jsr:@std/assert@^1";

import {
	type MessageLike,
	findFirstMatchedUrlSource,
} from "../src/services/context-message.ts";
import { matchDownloadCommandInput } from "../src/services/sources.ts";

function textMessage(text: string, urls: string[]): MessageLike {
	return {
		text,
		entities: urls.map((url) => ({
			type: "url",
			offset: text.indexOf(url),
			length: url.length,
		})),
	};
}

Deno.test("matched URL selection prefers the triggering message", () => {
	const trigger = textMessage("@ummrobot https://youtu.be/direct", [
		"https://youtu.be/direct",
	]);
	const reply = textMessage("https://youtu.be/reply", [
		"https://youtu.be/reply",
	]);

	const result = findFirstMatchedUrlSource(
		[trigger, reply],
		matchDownloadCommandInput,
	);

	assertEquals(result?.url, "https://youtu.be/direct");
	assertEquals(result?.matchResult.type, "youtubeVideo");
	assertStrictEquals(result?.sourceMessage, trigger);
});

Deno.test("matched URL selection falls back to the replied message", () => {
	const trigger = textMessage("@ummrobot https://example.com/post", [
		"https://example.com/post",
	]);
	const reply = textMessage("https://youtu.be/reply", [
		"https://youtu.be/reply",
	]);

	const result = findFirstMatchedUrlSource(
		[trigger, reply],
		matchDownloadCommandInput,
	);

	assertEquals(result?.url, "https://youtu.be/reply");
	assertEquals(result?.matchResult.type, "youtubeVideo");
	assertStrictEquals(result?.sourceMessage, reply);
});

Deno.test("matched URL selection ignores non-URL message text", () => {
	const trigger: MessageLike = {
		text: "@ummrobot https://youtu.be/not-an-entity",
		entities: [{ type: "mention", offset: 0, length: 9 }],
	};

	assertEquals(
		findFirstMatchedUrlSource([trigger], matchDownloadCommandInput),
		null,
	);
});
