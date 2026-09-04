import { assertEquals } from "jsr:@std/assert@^1";
import type { PostfetchResult } from "@postfetch/core";

import {
	POSTFETCH_MAX_BYTES,
	toCaptionMeta,
} from "../src/services/postfetch.ts";

Deno.test("requests media within the 50 MB Postfetch budget", () => {
	assertEquals(POSTFETCH_MAX_BYTES, 50_000_000);
});

Deno.test("preserves nested X metadata and media ownership", () => {
	const result: PostfetchResult = {
		archiveFilename: "twitter_100.zip",
		id: "100",
		items: [
			{
				filename: "twitter_100_1.jpg",
				headers: {},
				id: "100",
				kind: "image",
				mime: "image/jpeg",
				platform: "twitter",
				url: "https://pbs.twimg.com/outer.jpg",
			},
			{
				filename: "twitter_90_1.mp4",
				headers: {},
				id: "90",
				kind: "video",
				mime: "video/mp4",
				platform: "twitter",
				url: "https://video.twimg.com/quoted.mp4",
			},
		],
		metadata: {
			text: "Outer text",
			author: { handle: "outer", name: "Outer Name" },
			extra: {
				quotedTweet: {
					id: "90",
					metadata: {
						text: "Quoted text",
						author: { handle: "quoted", name: "Quoted Name" },
					},
				},
			},
		},
		platform: "twitter",
	};

	assertEquals(toCaptionMeta(result), {
		title: undefined,
		text: "Outer text",
		authorHandle: "outer",
		authorName: "Outer Name",
		authorVerified: undefined,
		likeCount: undefined,
		commentCount: undefined,
		mediaCount: 1,
		quotedPost: {
			title: undefined,
			text: "Quoted text",
			authorHandle: "quoted",
			authorName: "Quoted Name",
			authorVerified: undefined,
			likeCount: undefined,
			commentCount: undefined,
			mediaCount: 1,
			quotedPost: undefined,
		},
	});
});
