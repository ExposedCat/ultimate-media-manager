import fs from "node:fs/promises";

export async function prepareYoutubeVideo(url: string, id: string) {
	const directUrl = await fetch("http://127.0.0.1:9000", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Accept: "application/json",
		},
		body: JSON.stringify({
			url,
			videoQuality: "720",
		}),
	});

	const body = (await directUrl.json()) as
		| { status: "redirect" | "tunnel"; url: string; filename: string }
		| { status: "error"; error: { code: string } };

	if (body.status === "error") {
		return null;
	}

	const metadata = await fetch(body.url, { method: "HEAD" });
	const sizeMb =
		Number(metadata.headers.get("Estimated-Content-Length")) / (1024 * 1024);

	const name = body.filename.split(".").slice(0, -1).join(".");
	const extension = body.filename.split(".").at(-1) ?? "mp4";

	return { url: body.url, filename: `${id}.${extension}`, name, sizeMb };
}

export async function downloadYoutubeVideo(
	preparedVideo: Exclude<Awaited<ReturnType<typeof prepareYoutubeVideo>>, null>,
	pathPrefix: string,
) {
	const response = await fetch(preparedVideo.url);
	const buffer = await response.arrayBuffer();

	const path = `${pathPrefix}${preparedVideo.filename}`;
	await fs.writeFile(path, new Uint8Array(buffer));

	return path;
}

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
	pathPrefix: string,
): Promise<DownloadMediaResult | null> {
	try {
		const directUrl = await fetch("http://127.0.0.1:9000", {
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

			const filenames: string[] = [];
			for (const [index, buffer] of buffers.entries()) {
				const filename = `${pathPrefix}-${index}.jpg`;
				filenames.push(filename);
				await fs.writeFile(filename, new Uint8Array(buffer));
			}

			return { type: "multiple", filenames, mediaKind: "image" };
		}

		const extension = body.filename.split(".").at(-1)?.toLowerCase() ?? "";
		const isImage = IMAGE_EXTENSIONS.includes(extension);
		const isAudio = AUDIO_EXTENSIONS.includes(extension);

		const response = await fetch(body.url);
		const buffer = await response.arrayBuffer();

		const filename = `${pathPrefix}-${body.filename}`;
		await fs.writeFile(filename, new Uint8Array(buffer));

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
