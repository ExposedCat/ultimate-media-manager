import {
	assert,
	assertEquals,
	assertInstanceOf,
	assertStrictEquals,
} from "jsr:@std/assert@^1";
import { InputFile } from "grammy";

import { prepareDownloadedRichMedia } from "../src/services/rich-media-upload.ts";
import { buildRichMessage } from "../src/services/rich-message.ts";

Deno.test("rich video forwards Postfetch thumbnail and parameters without replacing its file", async () => {
	const bytes = new Uint8Array([1, 2, 3]);
	const thumbnail = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
	const file = new InputFile(bytes, "source.mp4");
	const items = await prepareDownloadedRichMedia({
		kind: "video",
		file,
		bytes,
		duration: 42,
		height: 720,
		thumbnail,
		width: 1280,
	});
	assertStrictEquals(items[0].media, file);
	assertInstanceOf(items[0].thumbnail, InputFile);
	assertEquals(items[0].duration, 42);
	assertEquals(items[0].height, 720);
	assertEquals(items[0].width, 1280);

	const message = buildRichMessage({
		baseHtml: "",
		captionEnabled: false,
		media: items,
		sourceType: "twitter",
	});
	const video = message.media?.[0].media;
	assert(video?.type === "video");
	assertStrictEquals(video.media, file);
	assertStrictEquals(video.thumbnail, items[0].thumbnail);
	assertEquals(
		{ duration: video.duration, height: video.height, width: video.width },
		{ duration: 42, height: 720, width: 1280 },
	);
});

Deno.test("mixed rich albums forward metadata only for videos and preserve order", async () => {
	const photo = new InputFile(new Uint8Array([1]), "photo.jpg");
	const video = new InputFile(new Uint8Array([2]), "video.mp4");
	const items = await prepareDownloadedRichMedia({
		kind: "images",
		files: [
			{
				kind: "image",
				file: photo,
				media: {
					data: new Uint8Array([1]),
					extension: "jpg",
					filename: "photo.jpg",
					mediaKind: "image",
				},
			},
			{
				kind: "video",
				file: video,
				media: {
					data: new Uint8Array([2]),
					duration: 3,
					extension: "mp4",
					filename: "video.mp4",
					height: 360,
					mediaKind: "video",
					thumbnail: new Uint8Array([3]),
					width: 640,
				},
			},
		],
	});
	assertEquals(items[0], { kind: "image", media: photo });
	assertStrictEquals(items[1].media, video);
	assertInstanceOf(items[1].thumbnail, InputFile);
	assertEquals(
		{
			duration: items[1].duration,
			height: items[1].height,
			width: items[1].width,
		},
		{ duration: 3, height: 360, width: 640 },
	);
});

Deno.test("non-Postfetch videos and non-video media remain usable without upload metadata", async () => {
	const file = new InputFile(new Uint8Array([1]), "file");
	for (const kind of ["image", "audio", "video"] as const) {
		assertEquals(await prepareDownloadedRichMedia({ kind, file }), [
			{ kind, media: file },
		]);
	}
});
