import { assertEquals, assertStringIncludes } from "jsr:@std/assert@^1";
import { InputFile } from "grammy";

import { cacheDownloadedMedia } from "../src/services/cache-media.ts";
import {
	deleteCachedMedia,
	setCachedMedia,
} from "../src/services/media-file-cache.ts";
import { downloadMatchedUrl } from "../src/services/url-download.ts";
import type { CustomContext } from "../src/types/context.ts";

const twitterMatch = {
	type: "twitter" as const,
	match: /x\.com/,
};

function testContext(overrides: Record<string, unknown>) {
	return {
		from: { id: 42, first_name: "Test" },
		telemetry: { event() {} },
		...overrides,
	} as unknown as CustomContext;
}

function captionI18n() {
	return {
		t(key: string, data: Record<string, unknown> = {}) {
			if (key === "viewOn.twitter") {
				return `${data.userName} shared this ${data.kind}`;
			}
			if (key === "promoCaption") {
				return String(data.viewUrl);
			}
			return key;
		},
	};
}

Deno.test("rich download retries cached media without a rejected caption", async () => {
	const url = "https://x.com/example/status/caption-fallback";
	setCachedMedia(url, {
		kind: "image",
		fileId: "cached-photo",
		metadata: { text: "Post caption" },
	});
	const richMessages: { html?: string }[] = [];

	try {
		const sent = await downloadMatchedUrl(
			testContext({
				i18n: captionI18n(),
				replyWithRichMessage(message: { html?: string }) {
					richMessages.push(message);
					if (richMessages.length === 1) {
						throw {
							error_code: 400,
							description: "Bad Request: can't parse entities",
						};
					}
					return {};
				},
			}),
			url,
			twitterMatch,
		);

		assertEquals(sent, true);
		assertEquals(richMessages.length, 2);
		assertEquals(richMessages[0].html?.includes("Post caption"), true);
		assertEquals(richMessages[1].html?.includes("Post caption"), false);
	} finally {
		deleteCachedMedia(url);
	}
});

Deno.test("video uses a rich message with caption fallback", async () => {
	const url = "https://x.com/example/status/rich-video";
	setCachedMedia(url, {
		kind: "video",
		fileId: "cached-video",
		metadata: { text: "Post caption" },
	});
	const richMessages: {
		html?: string;
		media?: {
			media: {
				media: unknown;
				type: string;
				supports_streaming?: boolean;
			};
		}[];
	}[] = [];
	try {
		const sent = await downloadMatchedUrl(
			testContext({
				i18n: captionI18n(),
				replyWithRichMessage(message: (typeof richMessages)[number]) {
					richMessages.push(message);
					if (richMessages.length === 1) {
						throw {
							error_code: 400,
							description: "Bad Request: can't parse entities",
						};
					}
					return {};
				},
			}),
			url,
			twitterMatch,
		);

		assertEquals(sent, true);
		assertEquals(richMessages.length, 2);
		assertEquals(richMessages[0].media?.[0].media, {
			type: "video",
			media: "cached-video",
			supports_streaming: true,
		});
		assertStringIncludes(richMessages[0].html ?? "", "Post caption");
		assertStringIncludes(richMessages[1].html ?? "", "Test shared this video");
		assertEquals(richMessages[1].html?.includes("Post caption"), false);
	} finally {
		deleteCachedMedia(url);
	}
});

Deno.test("download sends a video album as a rich slideshow", async () => {
	const url = "https://x.com/example/status/rich-video-album";
	setCachedMedia(url, {
		kind: "images",
		items: [
			{ kind: "image", fileId: "cached-photo" },
			{ kind: "video", fileId: "cached-video" },
		],
		metadata: { text: "Album caption" },
	});
	const richMessages: { html?: string }[] = [];
	try {
		const sent = await downloadMatchedUrl(
			testContext({
				i18n: captionI18n(),
				replyWithRichMessage(message: { html?: string }) {
					richMessages.push(message);
					return {};
				},
			}),
			url,
			twitterMatch,
		);

		assertEquals(sent, true);
		assertEquals(richMessages.length, 1);
		assertStringIncludes(richMessages[0].html ?? "", "<tg-slideshow>");
		assertStringIncludes(
			richMessages[0].html ?? "",
			'<video src="tg://video?id=media_1"/>',
		);
	} finally {
		deleteCachedMedia(url);
	}
});

Deno.test("guest download keeps a cached video album in a rich slideshow", async () => {
	const url = "https://x.com/example/status/guest-video-album";
	setCachedMedia(url, {
		kind: "images",
		items: [
			{ kind: "image", fileId: "cached-photo" },
			{ kind: "video", fileId: "cached-video" },
		],
		metadata: { text: "Album caption" },
	});
	const guestResults: Record<string, unknown>[] = [];
	try {
		const sent = await downloadMatchedUrl(
			testContext({
				guestMessage: {},
				i18n: captionI18n(),
				answerGuestQuery(result: Record<string, unknown>) {
					guestResults.push(result);
				},
			}),
			url,
			twitterMatch,
		);

		assertEquals(sent, true);
		assertEquals(guestResults.length, 1);
		const input = guestResults[0].input_message_content as Record<
			string,
			unknown
		>;
		const richMessage = input.rich_message as { html?: string };
		assertStringIncludes(richMessage.html ?? "", "<tg-slideshow>");
		assertStringIncludes(
			richMessage.html ?? "",
			'<video src="tg://video?id=media_1"/>',
		);
	} finally {
		deleteCachedMedia(url);
	}
});

Deno.test("guest download sends a standalone cached video in a rich message", async () => {
	const url = "https://x.com/example/status/guest-video";
	setCachedMedia(url, {
		kind: "video",
		fileId: "cached-video",
		metadata: { text: "Video caption" },
	});
	const guestResults: Record<string, unknown>[] = [];

	try {
		const sent = await downloadMatchedUrl(
			testContext({
				guestMessage: {},
				i18n: captionI18n(),
				answerGuestQuery(result: Record<string, unknown>) {
					guestResults.push(result);
				},
			}),
			url,
			twitterMatch,
		);

		assertEquals(sent, true);
		assertEquals(guestResults.length, 1);
		assertEquals(guestResults[0].type, "article");
		const input = guestResults[0].input_message_content as Record<
			string,
			unknown
		>;
		const richMessage = input.rich_message as { html?: string };
		assertStringIncludes(richMessage.html ?? "", "Video caption");
		assertStringIncludes(richMessage.html ?? "", "Test shared this video");
		assertStringIncludes(
			richMessage.html ?? "",
			'<video src="tg://video?id=media_0"/>',
		);
	} finally {
		deleteCachedMedia(url);
	}
});

Deno.test("guest video caching uses a rich message upload", async () => {
	const url = "https://x.com/example/status/fresh-guest-video";
	const calls: string[] = [];

	try {
		const cached = await cacheDownloadedMedia(
			testContext({
				api: {
					sendRichMessage(_chatId: number, message: { html?: string }) {
						calls.push("rich");
						assertStringIncludes(
							message.html ?? "",
							'<video src="tg://video?id=media_0"/>',
						);
						return {
							rich_message: {
								blocks: [{ type: "video", video: { file_id: "cached-video" } }],
							},
						};
					},
				},
			}),
			{
				kind: "video",
				file: new InputFile(new Uint8Array([0]), "video.mp4"),
				metadata: { text: "Video caption" },
			},
			url,
		);

		assertEquals(calls, ["rich"]);
		assertEquals(cached, {
			kind: "video",
			fileId: "cached-video",
			metadata: { text: "Video caption" },
		});
	} finally {
		deleteCachedMedia(url);
	}
});
