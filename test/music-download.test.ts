import { assertEquals, assertStringIncludes } from "jsr:@std/assert@^1";
import type { PostfetchResult } from "@postfetch/core";

import { initLocaleEngine } from "../src/config/locale-engine.ts";
import { escapeHtml } from "../src/helpers/html.ts";
import {
	buildDownloadResponseBaseText,
	buildDownloadResponseText,
} from "../src/services/download-response.ts";
import {
	deleteCachedMedia,
	setCachedMedia,
} from "../src/services/media-file-cache.ts";
import { toCaptionMeta } from "../src/services/postfetch.ts";
import { buildRichMessage } from "../src/services/rich-message.ts";
import {
	matchDownloadCommandInput,
	matchInput,
} from "../src/services/sources.ts";
import { downloadMatchedUrl } from "../src/services/url-download.ts";
import type { CustomContext } from "../src/types/context.ts";

const spotifyUrl =
	"https://open.spotify.com/track/2qGURS7y8zM7STkxOLgnWO?si=vZyDU6j2Qr-Ye4LpdORvzQ&utm_source=copy-link";
const spotifyPlaylistUrl =
	"https://open.spotify.com/playlist/7nndZmU2Kpa0FlRtUbQhsk?si=f0fcaeb2aa114488";
const youtubeUrl = "https://www.youtube.com/watch?v=Lq2TmRzg19k";
const shortsUrl = "https://www.youtube.com/shorts/OR9PgMqSjtw?si=share";
const musicUrl = "https://music.youtube.com/watch?v=Lq2TmRzg19k";
const i18n = initLocaleEngine(
	new URL("../src/locales", import.meta.url).pathname,
).createContext("en", {});
const ctx = { i18n } as CustomContext;
const data = {
	sourceType: "spotify" as const,
	url: spotifyUrl,
	userId: 42,
	userName: "Sender & Friend",
};
const result: PostfetchResult = {
	platform: "spotify",
	id: "2qGURS7y8zM7STkxOLgnWO",
	archiveFilename: "spotify.zip",
	items: [],
	comments: [],
	metadata: {
		title: "Song",
		author: { name: "Artist" },
		extra: { artists: ["Artist"], youtubeUrl },
	},
};
const expected = `<a href="tg://user?id=42">Sender &amp; Friend</a> shared <a href="${escapeHtml(spotifyUrl)}">this song</a> (<a href="${youtubeUrl}">source</a>)`;

Deno.test("Spotify match failures explain the missing YouTube match instead of saying the post was removed", async () => {
	const originalFetch = globalThis.fetch;
	const replies: string[] = [];
	const error = Object.assign(
		new Error("No matching YouTube video found for this Spotify track"),
		{ status: 404, reason: "noMatch" },
	);
	globalThis.fetch = () => Promise.reject(error);
	try {
		const sent = await downloadMatchedUrl(
			{
				i18n,
				from: { id: 42, first_name: data.userName },
				telemetry: { event() {} },
				reply(text: string) {
					replies.push(text);
					return {};
				},
			} as unknown as CustomContext,
			spotifyUrl,
		);
		assertEquals(sent, false);
		assertEquals(replies.length, 1);
		assertStringIncludes(replies[0], "No matching YouTube video found");
		assertEquals(replies[0].includes("Post was removed"), false);
	} finally {
		globalThis.fetch = originalFetch;
	}
});

Deno.test("auto-download and command match Spotify tracks and YouTube Music", () => {
	for (const matcher of [matchInput, matchDownloadCommandInput]) {
		for (const url of [
			spotifyUrl,
			"open.spotify.com/track/2qGURS7y8zM7STkxOLgnWO",
			"https://open.spotify.com/intl-de/track/2qGURS7y8zM7STkxOLgnWO/",
			"https://open.spotify.com/embed/track/2qGURS7y8zM7STkxOLgnWO",
		]) {
			assertEquals(matcher(url).type, "spotify", url);
		}
		assertEquals(matcher(musicUrl).type, "youtubeMusic");
		for (const url of [
			"https://open.spotify.com/album/2qGURS7y8zM7STkxOLgnWO",
			"https://open.spotify.com/playlist/2qGURS7y8zM7STkxOLgnWO",
			spotifyPlaylistUrl,
			"https://open.spotify.com/track/invalid",
			"https://example.com/open.spotify.com/track/2qGURS7y8zM7STkxOLgnWO",
		]) {
			assertEquals(matcher(url).type, null, url);
		}
	}
	assertEquals(matchInput(youtubeUrl).type, null);
	assertEquals(matchDownloadCommandInput(youtubeUrl).type, "youtubeVideo");
});

Deno.test("Spotify playlists are skipped before download side effects", async () => {
	const calls: string[] = [];
	const playlistContext = {
		from: { id: 42, first_name: "Test" },
		chat: { id: 42 },
		msg: { message_id: 1 },
		api: { setMessageReaction: () => calls.push("reaction") },
		i18n: { t: () => calls.push("translation") },
		telemetry: { event: () => calls.push("download") },
		replyWithRichMessage: () => calls.push("media"),
		reply: () => calls.push("reply"),
	} as unknown as CustomContext;
	setCachedMedia(spotifyPlaylistUrl, {
		kind: "video",
		fileId: "playlist-cache",
	});
	try {
		for (const matcher of [matchInput, matchDownloadCommandInput]) {
			assertEquals(
				await downloadMatchedUrl(playlistContext, spotifyPlaylistUrl, matcher),
				false,
			);
		}
		assertEquals(calls, []);
	} finally {
		deleteCachedMedia(spotifyPlaylistUrl);
	}
});

Deno.test("Spotify captions preserve the matched source in regular and rich messages", () => {
	const meta = toCaptionMeta(result);
	assertEquals(meta?.youtubeUrl, youtubeUrl);
	assertEquals(meta?.title, "Song");
	assertEquals(meta?.authorName, "Artist");
	for (const mediaKind of ["video", "audio"] as const) {
		const base = buildDownloadResponseBaseText(
			ctx,
			data,
			mediaKind,
			undefined,
			meta,
		);
		assertEquals(base, expected);
		const text = buildDownloadResponseText(
			ctx,
			data,
			mediaKind,
			undefined,
			meta,
		);
		assertStringIncludes(text, expected);
		assertStringIncludes(text, 'emoji-id="5431766850587347346"');
		const rich = buildRichMessage({
			baseHtml: base,
			captionEnabled: true,
			media: [{ kind: mediaKind, media: "file-id" }],
			metadata: meta,
			sourceType: "spotify",
		});
		assertStringIncludes(rich.html ?? "", expected);
		assertStringIncludes(rich.html ?? "", 'emoji-id="5431766850587347346"');
	}
	assertEquals(
		buildDownloadResponseBaseText(ctx, data, "video"),
		expected.slice(0, expected.indexOf(" (<a")),
	);
	assertStringIncludes(
		buildDownloadResponseBaseText(ctx, data, "video", undefined, {
			youtubeUrl: `${youtubeUrl}&feature="test"`,
		}),
		`${youtubeUrl}&amp;feature=&quot;test&quot;`,
	);
});

Deno.test("Spotify live fallbacks label the selected source as a live recording", () => {
	const liveResult = {
		...result,
		metadata: {
			...result.metadata,
			extra: {
				artists: ["Artist"],
				youtubeUrl,
				youtubeLiveFallback: true,
			},
		},
	} as PostfetchResult;
	const meta = toCaptionMeta(liveResult);
	assertEquals(meta?.youtubeLiveFallback, true);
	const text = buildDownloadResponseBaseText(
		ctx,
		data,
		"video",
		undefined,
		meta,
	);
	assertStringIncludes(text, `(<a href="${youtubeUrl}">live recording</a>)`);
	assertEquals(text.includes(">source</a>"), false);
});

Deno.test("YouTube captions distinguish Shorts, videos, and music while preserving links and icons", () => {
	for (const [url, kind, emojiId] of [
		[musicUrl, "song", "5404657863123550178"],
		[youtubeUrl, "video", "5454010052421626926"],
		["https://youtu.be/Lq2TmRzg19k?si=share", "video", "5454010052421626926"],
		[
			"https://www.youtube.com/live/Lq2TmRzg19k",
			"video",
			"5454010052421626926",
		],
		[shortsUrl, "short", "5454010052421626926"],
		[
			"https://m.youtube.com/shorts/OR9PgMqSjtw",
			"short",
			"5454010052421626926",
		],
	] as const) {
		const sourceType = matchDownloadCommandInput(url).type;
		if (!sourceType) throw new Error(`YouTube URL did not match: ${url}`);
		const text = buildDownloadResponseText(
			ctx,
			{ ...data, sourceType, url },
			"video",
		);
		assertStringIncludes(text, `emoji-id="${emojiId}"`);
		assertStringIncludes(
			text,
			`<a href="tg://user?id=42">Sender &amp; Friend</a> shared <a href="${escapeHtml(url)}">this ${kind}</a>`,
		);
		assertEquals(text.includes(">source</a>"), false);
	}
});

Deno.test("cached YouTube downloads preserve the Short, video, or song label", async () => {
	for (const [url, kind] of [
		[shortsUrl, "short"],
		[youtubeUrl, "video"],
		[musicUrl, "song"],
	] as const) {
		const sentMessages: { html?: string }[] = [];
		setCachedMedia(url, { kind: "video", fileId: "youtube-video" });
		try {
			const sent = await downloadMatchedUrl(
				{
					i18n,
					from: { id: 42, first_name: data.userName },
					telemetry: { event() {} },
					replyWithRichMessage(message: { html?: string }) {
						sentMessages.push(message);
						return {};
					},
				} as unknown as CustomContext,
				url,
				matchDownloadCommandInput,
			);
			assertEquals(sent, true);
			assertEquals(sentMessages.length, 1);
			assertStringIncludes(
				sentMessages[0].html ?? "",
				`<a href="${escapeHtml(url)}">this ${kind}</a>`,
			);
		} finally {
			deleteCachedMedia(url);
		}
	}
});

Deno.test("Spotify auto-download keeps both caption links when reusing cached media", async () => {
	const sentMessages: { html?: string }[] = [];
	setCachedMedia(spotifyUrl, {
		kind: "video",
		fileId: "spotify-video",
		metadata: toCaptionMeta(result),
	});
	try {
		const sent = await downloadMatchedUrl(
			{
				i18n,
				from: { id: 42, first_name: data.userName },
				telemetry: { event() {} },
				replyWithRichMessage(message: { html?: string }) {
					sentMessages.push(message);
					return {};
				},
			} as unknown as CustomContext,
			spotifyUrl,
		);
		assertEquals(sent, true);
		assertEquals(sentMessages.length, 1);
		assertStringIncludes(sentMessages[0].html ?? "", expected);
		assertStringIncludes(
			sentMessages[0].html ?? "",
			'emoji-id="5431766850587347346"',
		);
	} finally {
		deleteCachedMedia(spotifyUrl);
	}
});
