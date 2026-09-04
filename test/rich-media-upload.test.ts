import { assertEquals } from "jsr:@std/assert@^1";
import { InputFile } from "grammy";

import { prepareDownloadedRichMedia } from "../src/services/rich-media-upload.ts";

Deno.test("rich media uses the file already prepared by the downloader", () => {
	const original = new Uint8Array([1, 2, 3]);
	const originalFile = new InputFile(original, "source.mp4");

	const items = prepareDownloadedRichMedia({
		kind: "video",
		file: originalFile,
		bytes: original,
		extension: "mp4",
		filename: "source.mp4",
	});

	assertEquals(items, [{ kind: "video", media: originalFile }]);
});
