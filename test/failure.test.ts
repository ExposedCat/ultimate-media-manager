import { assertEquals } from "jsr:@std/assert@^1";

import {
	classifyMediaSendFailure,
	getFailureCode,
} from "../src/services/failure.ts";

Deno.test("classifies Telegram's 413 response as a large file", () => {
	assertEquals(
		classifyMediaSendFailure({
			error_code: 413,
			description: "Request Entity Too Large",
		}),
		{ code: "413", reason: "fileTooLarge" },
	);
});

Deno.test("classifies Telegram's alternate large-file description", () => {
	assertEquals(
		classifyMediaSendFailure({
			error_code: 400,
			description: "Bad Request: file is too big",
		}),
		{ code: "400", reason: "fileTooLarge" },
	);
});

Deno.test("classifies common friendly media-send failures", () => {
	assertEquals(
		classifyMediaSendFailure({
			error_code: 400,
			description: "Bad Request: VIDEO_CONTENT_TYPE_INVALID",
		}),
		{ code: "400", reason: "unsupportedMedia" },
	);
	assertEquals(
		classifyMediaSendFailure({
			error_code: 429,
			description: "Too Many Requests: retry after 5",
		}),
		{ code: "429", reason: "rateLimited" },
	);
});

Deno.test("unknown failures retain only their code", () => {
	assertEquals(
		classifyMediaSendFailure({
			error_code: 400,
			description: "Bad Request: sensitive implementation detail",
		}),
		{ code: "400", reason: "unknown" },
	);
});

Deno.test("extracts HTTP codes from download error messages", () => {
	assertEquals(
		getFailureCode("yt-dlp failed: HTTP Error 403: Forbidden"),
		"403",
	);
	assertEquals(getFailureCode(new Error("resolver exploded")), "unknown");
});
