import { assert, assertEquals } from "jsr:@std/assert@^1";
import { APP_ENV } from "../src/config/env.ts";
import { DEFAULT_SETTINGS } from "../src/services/chat.ts";
import { downloadMediaForUrl } from "../src/services/download-media.ts";
import { buildDownloadResponse } from "../src/services/download-response.ts";
import type { CustomContext } from "../src/types/context.ts";

const url = "https://www.tiktok.com/@creator/photo/123456789";
const encoders = await new Deno.Command(APP_ENV.FFMPEG_PATH, {
	args: ["-hide_banner", "-encoders"],
	stdout: "piped",
	stderr: "null",
})
	.output()
	.catch(() => null);
const hasEncoder =
	encoders?.success &&
	new TextDecoder().decode(encoders.stdout).includes("libx264");

Deno.test({
	name: "published Postfetch builds upload-ready slideshow videos and respects chat delay/off",
	ignore: !hasEncoder,
}, async () => {
	const directory = await Deno.makeTempDir({ prefix: "umm-slideshow-test-" });
	const originalFetch = globalThis.fetch;
	try {
		async function generate(args: string[]) {
			const result = await new Deno.Command(APP_ENV.FFMPEG_PATH, {
				args: ["-nostdin", "-hide_banner", "-loglevel", "error", "-y", ...args],
				stderr: "piped",
				stdout: "null",
			}).output();
			assert(result.success, new TextDecoder().decode(result.stderr));
		}
		await generate([
			"-f",
			"lavfi",
			"-i",
			"color=red:s=160x120",
			"-frames:v",
			"1",
			`${directory}/red.png`,
		]);
		await generate([
			"-f",
			"lavfi",
			"-i",
			"color=blue:s=120x160",
			"-frames:v",
			"1",
			`${directory}/blue.png`,
		]);
		await generate([
			"-f",
			"lavfi",
			"-i",
			"sine=frequency=440:duration=0.2",
			`${directory}/sound.wav`,
		]);
		const files = new Map<string, Uint8Array>();
		for (const name of ["red.png", "blue.png", "sound.wav"])
			files.set(name, await Deno.readFile(`${directory}/${name}`));
		let includeAudio = true;
		globalThis.fetch = async (input, init) => {
			const requested = String(input);
			if (requested.startsWith("blob:")) return originalFetch(input, init);
			if (requested.includes("tiktok.com/@i/video/")) {
				const state = {
					__DEFAULT_SCOPE__: {
						"webapp.video-detail": {
							itemInfo: {
								itemStruct: {
									author: { uniqueId: "creator" },
									desc: "Slideshow caption",
									imagePost: {
										images: ["red.png", "blue.png"].map((name) => ({
											imageURL: { urlList: [`https://cdn.test/${name}`] },
										})),
									},
									music: includeAudio
										? { playUrl: "https://cdn.test/sound.wav" }
										: {},
								},
							},
						},
					},
				};
				return new Response(
					`<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">${JSON.stringify(state)}</script>`,
					{ headers: { "set-cookie": "ttwid=test; Path=/" } },
				);
			}
			const bytes = files.get(new URL(requested).pathname.slice(1));
			assert(bytes, `unexpected request: ${requested}`);
			assertEquals(new Headers(init?.headers).get("cookie"), "ttwid=test");
			return new Response(
				init?.method === "HEAD" ? null : new Uint8Array(bytes).buffer,
				{ headers: { "content-length": String(bytes.length) } },
			);
		};

		const defaultResult = await downloadMediaForUrl(url);
		assertEquals(defaultResult.error, undefined);
		assert(defaultResult.media?.kind === "video");
		assertEquals(defaultResult.media.width, 720);
		assertEquals(defaultResult.media.height, 1280);
		assert(
			(defaultResult.media.duration ?? 0) >= 2 &&
				(defaultResult.media.duration ?? 0) <= 3,
		);
		assertEquals(defaultResult.media.extension, "mp4");
		assertEquals(defaultResult.media.metadata?.text, "Slideshow caption");
		assert(defaultResult.media.bytes && defaultResult.media.bytes.length > 0);
		assertEquals(
			defaultResult.media.thumbnail?.slice(0, 2),
			Uint8Array.of(0xff, 0xd8),
		);

		const ctx = {
			objects: {
				chat: { settings: { ...DEFAULT_SETTINGS, slideshowDelay: 3 } },
			},
			i18n: { t: () => "caption" },
		} as unknown as CustomContext;
		const response = await buildDownloadResponse(ctx, {
			url,
			sourceType: "tiktok",
			userId: 42,
			userName: "User",
		});
		assert(response.media?.kind === "video");
		assert(
			(response.media.duration ?? 0) >= 6 &&
				(response.media.duration ?? 0) <= 7,
		);
		assertEquals(response.media.metadata?.text, "Slideshow caption");

		const disabled = await downloadMediaForUrl(url, { slideshowDelay: 0 });
		assert(disabled.media?.kind === "images");
		assertEquals(disabled.media.files.length, 2);
		assertEquals(disabled.media.files[0].media.data, files.get("red.png"));

		includeAudio = false;
		const ordinaryAlbum = await downloadMediaForUrl(url);
		assert(ordinaryAlbum.media?.kind === "images");
		assertEquals(ordinaryAlbum.media.files.length, 2);
	} finally {
		globalThis.fetch = originalFetch;
		await Deno.remove(directory, { recursive: true });
	}
});
