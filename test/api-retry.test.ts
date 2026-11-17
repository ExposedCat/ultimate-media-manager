import {
	assertEquals,
	assertRejects,
	assertStrictEquals,
} from "jsr:@std/assert@^1";
import { HttpError } from "grammy";
import { telegramApiRetry } from "../src/config/api-retry.ts";

Deno.test("Telegram server errors never repeat a possibly delivered rich message", async () => {
	for (const code of [500, 502, 503, 504]) {
		let attempts = 0;
		const response = {
			ok: false as const,
			error_code: code,
			description: "Server error",
		};
		const result = await telegramApiRetry()(
			async () => {
				attempts++;
				return response;
			},
			"sendRichMessage",
			{ chat_id: 42, rich_message: { html: "video" } },
		);
		assertStrictEquals(result, response);
		assertEquals(attempts, 1);
	}
});

Deno.test("Telegram network errors never repeat a possibly delivered rich message", async () => {
	let attempts = 0;
	const error = new HttpError(
		"Connection closed after upload",
		new Error("reset"),
	);
	const caught = await assertRejects(() =>
		telegramApiRetry()(
			async () => {
				attempts++;
				throw error;
			},
			"sendRichMessage",
			{ chat_id: 42, rich_message: { html: "video" } },
		),
	);
	assertStrictEquals(caught, error);
	assertEquals(attempts, 1);
});

Deno.test("Telegram rate-limit rejections still retry with a bounded attempt count", async () => {
	let attempts = 0;
	const response = {
		ok: false as const,
		error_code: 429,
		description: "Too Many Requests",
		parameters: { retry_after: 0 },
	};
	const result = await telegramApiRetry()(
		async () => {
			attempts++;
			return response;
		},
		"sendRichMessage",
		{ chat_id: 42, rich_message: { html: "video" } },
	);
	assertStrictEquals(result, response);
	assertEquals(attempts, 6);
});
