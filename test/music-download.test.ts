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
const youtubeUrl = "https://www.youtube.com/watch?v=Lq2TmRzg19k";
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
			"https://open.spotify.com/track/invalid",
			"https://example.com/open.spotify.com/track/2qGURS7y8zM7STkxOLgnWO",
		]) {
			assertEquals(matcher(url).type, null, url);
		}
	}
	assertEquals(matchInput(youtubeUrl).type, null);
	assertEquals(matchDownloadCommandInput(youtubeUrl).type, "youtubeVideo");
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

Deno.test("YouTube song captions use the original link and the correct platform icon", () => {
	for (const [sourceType, url, emojiId] of [
		["youtubeMusic", musicUrl, "5404657863123550178"],
		["youtubeVideo", youtubeUrl, "5454010052421626926"],
	] as const) {
		const text = buildDownloadResponseText(
			ctx,
			{ ...data, sourceType, url },
			"video",
		);
		assertStringIncludes(text, `emoji-id="${emojiId}"`);
		assertStringIncludes(
			text,
			`<a href="tg://user?id=42">Sender &amp; Friend</a> shared <a href="${url}">this song</a>`,
		);
		assertEquals(text.includes(">source</a>"), false);
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
