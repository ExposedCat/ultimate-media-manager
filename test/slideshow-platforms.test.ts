import { assert, assertEquals } from "jsr:@std/assert@^1";
import type { Platform, PostfetchResult } from "@postfetch/core";
import { APP_ENV } from "../src/config/env.ts";
import { downloadPostfetchItems } from "../src/services/postfetch.ts";

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
	name: "every platform uses the shared photo + soundtrack conversion and off setting",
	ignore: !hasEncoder,
}, async () => {
	const directory = await Deno.makeTempDir({
		prefix: "umm-platform-slideshow-",
	});
	const originalFetch = globalThis.fetch;
	try {
		for (const [name, args] of [
			[
				"photo.png",
				["-f", "lavfi", "-i", "color=red:s=160x120", "-frames:v", "1"],
			],
			["sound.wav", ["-f", "lavfi", "-i", "sine=frequency=440:duration=0.2"]],
		] as const) {
			const generated = await new Deno.Command(APP_ENV.FFMPEG_PATH, {
				args: [
					"-nostdin",
					"-hide_banner",
					"-loglevel",
					"error",
					"-y",
					...args,
					`${directory}/${name}`,
				],
				stdout: "null",
				stderr: "piped",
			}).output();
			assert(generated.success, new TextDecoder().decode(generated.stderr));
		}
		const photo = await Deno.readFile(`${directory}/photo.png`);
		const sound = await Deno.readFile(`${directory}/sound.wav`);
		globalThis.fetch = (input, init) => {
			if (String(input).startsWith("blob:")) return originalFetch(input, init);
			assertEquals(new Headers(init?.headers).get("x-fixture"), "soundtrack");
			const bytes = String(input).endsWith("photo.png") ? photo : sound;
			return Promise.resolve(new Response(new Uint8Array(bytes).buffer));
		};
		const platforms: Platform[] = [
			"instagram",
			"tiktok",
			"facebook",
			"twitter",
			"reddit",
			"pinterest",
			"linkedin",
			"youtube",
			"spotify",
			"soundcloud",
		];
		for (const platform of platforms) {
			const items = (["image", "audio"] as const).map((kind) => ({
				kind,
				platform,
				id: "fixture",
				headers: { "x-fixture": "soundtrack" },
				filename: kind === "image" ? "photo.png" : "sound.wav",
				mime: kind === "image" ? "image/png" : "audio/wav",
				url: `https://cdn.test/${kind === "image" ? "photo.png" : "sound.wav"}`,
			}));
			const result = {
				platform,
				id: "fixture",
				archiveFilename: "fixture.zip",
				comments: [],
				items,
			} as PostfetchResult;
			const files = await downloadPostfetchItems(result);
			assertEquals(files.length, 1, platform);
			assertEquals(files[0].mediaKind, "video", platform);
			assertEquals(files[0].contentType, "video/mp4");
			assert((files[0].duration ?? 0) >= 1);
			assert(files[0].thumbnail?.length);
			await Deno.writeFile(`${directory}/result.mp4`, files[0].data);
			const probe = await new Deno.Command("ffprobe", {
				args: [
					"-v",
					"error",
					"-show_entries",
					"stream=codec_type",
					"-of",
					"json",
					`${directory}/result.mp4`,
				],
				stdout: "piped",
				stderr: "piped",
			}).output();
			assert(probe.success, new TextDecoder().decode(probe.stderr));
			assertEquals(
				JSON.parse(new TextDecoder().decode(probe.stdout)).streams.map(
					(stream: { codec_type: string }) => stream.codec_type,
				),
				["video", "audio"],
				platform,
			);
			const disabled = await downloadPostfetchItems(result, {
				slideshowDelay: 0,
			});
			assertEquals(
				disabled.map((file) => file.mediaKind),
				["image", "audio"],
			);
			assertEquals(disabled[0].data, photo);
			const plain = await downloadPostfetchItems({
				...result,
				items: [items[0]],
			});
			assertEquals(
				plain.map((file) => file.mediaKind),
				["image"],
			);
		}
	} finally {
		globalThis.fetch = originalFetch;
		await Deno.remove(directory, { recursive: true });
	}
});
