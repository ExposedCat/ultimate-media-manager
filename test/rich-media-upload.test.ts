import { assert, assertEquals } from "jsr:@std/assert@^1";
import { InputFile } from "grammy";

import { prepareDownloadedRichMedia } from "../src/services/rich-media-upload.ts";

Deno.test("fresh MP4s are remuxed before rich-message upload", async () => {
	const original = new Uint8Array([1, 2, 3]);
	const originalFile = new InputFile(original, "source.mp4");
	let args: string[] | undefined;

	const items = await prepareDownloadedRichMedia(
		{
			kind: "video",
			file: originalFile,
			bytes: original,
			extension: "mp4",
			filename: "source.mp4",
		},
		async (nextArgs) => {
			args = nextArgs;
			const input = nextArgs[nextArgs.indexOf("-i") + 1];
			const output = nextArgs.at(-1);
			assert(output);
			await Deno.copyFile(input, output);
			return { success: true, stderr: new Uint8Array() };
		},
	);

	assertEquals(items.length, 1);
	assertEquals(items[0].kind, "video");
	assert(items[0].media instanceof InputFile);
	assert(items[0].media !== originalFile);
	assertEquals(await items[0].media.toRaw(), original);
	assert(args);
	assertEquals(args.includes("copy"), true);
	assertEquals(args.includes("make_zero"), true);
	assertEquals(args.includes("-use_editlist"), true);
});

Deno.test("failed rich MP4 remux falls back to the original upload", async () => {
	const original = new Uint8Array([1, 2, 3]);
	const originalFile = new InputFile(original, "source.mp4");

	const items = await prepareDownloadedRichMedia(
		{
			kind: "video",
			file: originalFile,
			bytes: original,
			extension: "mp4",
			filename: "source.mp4",
		},
		() =>
			Promise.resolve({
				success: false,
				stderr: new TextEncoder().encode("bad input"),
			}),
	);

	assertEquals(items, [{ kind: "video", media: originalFile }]);
});

Deno.test("non-MP4 rich media bypasses ffmpeg", async () => {
	const originalFile = new InputFile(new Uint8Array([1]), "image.jpg");
	let calls = 0;

	const items = await prepareDownloadedRichMedia(
		{
			kind: "image",
			file: originalFile,
			bytes: new Uint8Array([1]),
			extension: "jpg",
			filename: "image.jpg",
		},
		() => {
			calls += 1;
			return Promise.resolve({ success: true, stderr: new Uint8Array() });
		},
	);

	assertEquals(calls, 0);
	assertEquals(items, [{ kind: "image", media: originalFile }]);
});
