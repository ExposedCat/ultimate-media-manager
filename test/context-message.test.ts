import { assertEquals, assertStrictEquals } from "jsr:@std/assert@^1";

import {
	type MessageLike,
	findFirstMatchedUrlSource,
	isStandaloneUrlMessage,
	shouldIgnoreForwardedMessage,
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

Deno.test("standalone links allow X and Reddit comment counts for cleanup", () => {
	for (const url of [
		"https://x.com/example/status/123?s=20",
		"x.com/example/status/123",
		"https://twitter.com/example/status/123",
		"https://www.reddit.com/r/pics/comments/abc/title/",
	]) {
		for (const suffix of ["", " 5", "\t12", " 0", " 005", " 5 \n"]) {
			assertEquals(
				isStandaloneUrlMessage(textMessage(url + suffix, [url]), url),
				true,
			);
			assertEquals(
				isStandaloneUrlMessage({ caption: url + suffix }, url),
				true,
			);
		}
	}
});

Deno.test("cleanup preserves other text, links, invalid counts and unsupported counts", () => {
	const url = "https://x.com/example/status/123";
	for (const text of [
		`Check this: ${url} 5`,
		`${url} 5, cool?`,
		`${url} 5!`,
		`${url} 5 https://x.com/other/status/456`,
		`${url} 5 10`,
		`${url} -2`,
		`${url} 1.5`,
		`${url} 5abc`,
		`${url} 1e3`,
		`${url} 999999999999999999999`,
		`${url}\n5`,
		`${url}5`,
	]) {
		assertEquals(isStandaloneUrlMessage(textMessage(text, [url]), url), false);
	}
	assertEquals(
		isStandaloneUrlMessage(
			{
				text: "Click here 5",
				entities: [{ type: "text_link", offset: 0, length: 10, url }],
			},
			url,
		),
		false,
	);
	const instagram = "https://www.instagram.com/p/abc/";
	assertEquals(isStandaloneUrlMessage({ text: instagram }, instagram), true);
	assertEquals(
		isStandaloneUrlMessage({ text: `${instagram} 5` }, instagram),
		false,
	);
});

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

Deno.test("download matching recognizes LinkedIn posts", () => {
	const url =
		"https://www.linkedin.com/posts/example_activity-1234567890123456789-test";
	const result = findFirstMatchedUrlSource(
		[textMessage(url, [url])],
		matchDownloadCommandInput,
	);
	assertEquals(result?.matchResult.type, "linkedin");
});

Deno.test("forward filtering ignores channel posts", () => {
	assertEquals(
		shouldIgnoreForwardedMessage(
			{
				forward_origin: { type: "channel" },
			},
			"supergroup",
		),
		true,
	);
});

Deno.test("forward filtering ignores bot messages", () => {
	assertEquals(
		shouldIgnoreForwardedMessage(
			{
				forward_origin: {
					type: "user",
					sender_user: { is_bot: true },
				},
			},
			"group",
		),
		true,
	);
});

Deno.test("forward filtering allows every origin in private chats", () => {
	const allowedOrigins: MessageLike["forward_origin"][] = [
		{ type: "channel" },
		{ type: "user", sender_user: { is_bot: true } },
	];

	for (const forward_origin of allowedOrigins) {
		assertEquals(
			shouldIgnoreForwardedMessage({ forward_origin }, "private"),
			false,
		);
	}
});

Deno.test("forward filtering allows other forwarded messages", () => {
	const allowedOrigins: MessageLike["forward_origin"][] = [
		{ type: "user", sender_user: { is_bot: false } },
		{ type: "hidden_user" },
		{ type: "chat" },
	];

	for (const forward_origin of allowedOrigins) {
		assertEquals(
			shouldIgnoreForwardedMessage({ forward_origin }, "supergroup"),
			false,
		);
	}
});
