import { APP_ENV } from "../config/env.ts";

export type DownloadMediaResult =
	| {
			type: "single";
			filename: string | null;
			mediaKind: "image" | "video" | "audio";
	  }
	| {
			type: "multiple";
			filenames: string[];
			mediaKind: "image";
	  };

const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "gif"];
const AUDIO_EXTENSIONS = ["mp3", "wav", "ogg", "m4a"];

export async function downloadMedia(
	url: string,
	tempDir: string,
): Promise<DownloadMediaResult | null> {
	const filenames: string[] = [];
	try {
		const directUrl = await fetch(APP_ENV.COBALT_API_URL, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Accept: "application/json",
			},
			body: JSON.stringify({ url }),
		});

		const body = (await directUrl.json()) as
			| { status: "redirect" | "tunnel"; url: string; filename: string }
			| { status: "picker"; picker: { type: "photo"; url: string }[] }
			| { status: "error"; error: { code: string } };

		if (body.status === "error") {
			return null;
		}

		if (body.status === "picker") {
			const responses = await Promise.all(
				body.picker.map((item) => fetch(item.url)),
			);
			const buffers = await Promise.all(
				responses.map((response) => response.arrayBuffer()),
			);

			for (const [index, buffer] of buffers.entries()) {
				const filename = `${tempDir}/${index}.jpg`;
				await Deno.writeFile(filename, new Uint8Array(buffer));
				filenames.push(filename);
			}

			return { type: "multiple", filenames, mediaKind: "image" };
		}

		const extension = body.filename.split(".").at(-1)?.toLowerCase() ?? "";
		const isImage = IMAGE_EXTENSIONS.includes(extension);
		const isAudio = AUDIO_EXTENSIONS.includes(extension);

		const response = await fetch(body.url);
		const buffer = await response.arrayBuffer();

		const filename = `${tempDir}/${body.filename}`;
		await Deno.writeFile(filename, new Uint8Array(buffer));
		filenames.push(filename);

		return {
			type: "single",
			filename,
			mediaKind: isImage ? "image" : isAudio ? "audio" : "video",
		};
	} catch (error) {
		console.log("Cobalt failed to prepare media", error);
		return null;
	}
}
