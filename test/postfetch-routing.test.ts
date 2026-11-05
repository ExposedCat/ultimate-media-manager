import { assert, assertEquals, assertRejects } from "jsr:@std/assert@^1";

import { APP_ENV } from "../src/config/env.ts";
import { downloadWithPostfetch } from "../src/services/postfetch.ts";

const id = "1dxbCgNcuuQcqdJopqhv2N";
const url = `https://open.spotify.com/track/${id}?si=tracking&utm_source=copy-link`;
const videoId = "c-0S68_ZLL8";
const mediaUrl = "https://cdn.test/video.mp4";
const botCheck = "Sign in to confirm you’re not a bot";

// A tiny real MP4 exercises the final media download and normalization as well
// as resolution, so mixing proxy and direct routes cannot pass unnoticed.
const video = await new Deno.Command(APP_ENV.FFMPEG_PATH, {
	args: [
		"-hide_banner",
		"-loglevel",
		"error",
		"-f",
		"lavfi",
		"-i",
		"color=red:s=160x120:r=1:d=1",
		"-an",
		"-c:v",
		"mpeg4",
		"-pix_fmt",
		"yuv420p",
		"-movflags",
		"frag_keyframe+empty_moov",
		"-f",
		"mp4",
		"pipe:1",
	],
	stdout: "piped",
	stderr: "piped",
})
	.output()
	.catch(() => null);

function fixture(options: { blocked?: boolean; noMatch?: boolean } = {}) {
	const requests: string[] = [];
	const fetcher: typeof fetch = async (input) => {
		const requested = String(input);
		requests.push(requested);
		if (requested === `https://open.spotify.com/embed/track/${id}`) {
			return new Response(
				`<script id="__NEXT_DATA__">${JSON.stringify({
					props: {
						pageProps: {
							state: {
								data: {
									entity: {
										id,
										type: "track",
										title: "Лишь однажды",
										artists: [{ name: "Valentin Strykalo" }],
										duration: 172546,
									},
								},
							},
						},
					},
				})}</script>`,
			);
		}
		if (requested.startsWith("https://www.youtube.com/results?")) {
			return new Response(
				`<script>var ytInitialData = ${JSON.stringify({
					contents: {
						items: options.noMatch
							? []
							: [
									{
										videoRenderer: {
											videoId,
											title: { simpleText: "Лишь однажды" },
											ownerText: { simpleText: "Valentin Strykalo - Topic" },
											lengthText: { simpleText: "2:53" },
										},
									},
								],
					},
				})};</script>`,
			);
		}
		if (requested.startsWith("https://www.youtube.com/watch?")) {
			return new Response(
				'"visitorData":"visitor","jsUrl":"/s/player/test/base.js"',
			);
		}
		if (requested.includes("/s/player/")) {
			return new Response("signatureTimestamp:20000");
		}
		if (requested.includes("/youtubei/v1/player")) {
			return Response.json(
				options.blocked
					? {
							playabilityStatus: { status: "LOGIN_REQUIRED", reason: botCheck },
						}
					: {
							playabilityStatus: { status: "OK" },
							videoDetails: {
								title: "Лишь однажды",
								author: "Valentin Strykalo",
							},
							streamingData: {
								formats: [
									{
										url: mediaUrl,
										mimeType: "video/mp4",
										height: 120,
									},
								],
							},
						},
			);
		}
		if (requested === mediaUrl) {
			assert(video?.success, "ffmpeg must be available for media fixtures");
			return new Response(new Uint8Array(video.stdout), {
				headers: { "content-length": String(video.stdout.length) },
			});
		}
		throw new Error(`Unexpected request: ${requested}`);
	};
	return { fetch: fetcher, requests };
}

for (const blocked of [true, false]) {
	Deno.test({
		name: blocked
			? "Spotify retries a WARP YouTube bot check with direct resolution and media download"
			: "Spotify keeps successful resolution and media download on WARP",
		ignore: !video?.success,
	}, async () => {
		const originalFetch = globalThis.fetch;
		const proxy = fixture({ blocked });
		const direct = fixture();
		globalThis.fetch = direct.fetch;
		try {
			const result = await downloadWithPostfetch(url, {}, proxy.fetch);
			assert(result?.type === "single");
			assertEquals(result.mediaKind, "video");
			assert(result.file.data.length > 0);
			assert(result.file.thumbnail && result.file.thumbnail.length > 0);
			assertEquals(result.metadata?.title, "Лишь однажды");
			assertEquals(
				result.metadata?.youtubeUrl,
				`https://www.youtube.com/watch?v=${videoId}`,
			);
			assertEquals(proxy.requests.includes(mediaUrl), !blocked);
			assertEquals(direct.requests.includes(mediaUrl), blocked);
			assertEquals(
				direct.requests.filter((request) => request.includes("/embed/track/"))
					.length,
				blocked ? 1 : 0,
			);
			if (!blocked) assertEquals(direct.requests, []);
		} finally {
			globalThis.fetch = originalFetch;
		}
	});
}

Deno.test("Spotify does not retry missing matches through a different route", async () => {
	const originalFetch = globalThis.fetch;
	let directRequests = 0;
	globalThis.fetch = () => {
		directRequests++;
		throw new Error("Unexpected direct retry");
	};
	try {
		const error = await assertRejects(() =>
			downloadWithPostfetch(url, {}, fixture({ noMatch: true }).fetch),
		);
		assertEquals((error as { reason?: string }).reason, "noMatch");
		assertEquals(directRequests, 0);
	} finally {
		globalThis.fetch = originalFetch;
	}
});

Deno.test("Spotify stops after one direct retry when both routes are bot-blocked", async () => {
	const originalFetch = globalThis.fetch;
	const direct = fixture({ blocked: true });
	globalThis.fetch = direct.fetch;
	try {
		await assertRejects(
			() => downloadWithPostfetch(url, {}, fixture({ blocked: true }).fetch),
			Error,
			`YouTube resolution failed: ${botCheck}`,
		);
		assertEquals(
			direct.requests.filter((request) => request.includes("/embed/track/"))
				.length,
			1,
		);
	} finally {
		globalThis.fetch = originalFetch;
	}
});
