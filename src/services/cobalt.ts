import { APP_ENV } from "../config/env.ts";

export type DownloadMediaResult =
	| {
			type: "single";
			filename: string | null;
			mediaKind: "image" | "video" | "audio";
			publicUrl: string;
			extension: string;
	  }
	| {
			type: "multiple";
			filenames: string[];
			mediaKind: "image";
			publicUrls: string[];
	  };

const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "gif"];
const AUDIO_EXTENSIONS = ["mp3", "wav", "ogg", "m4a"];

type CobaltResponse =
	| { status: "redirect" | "tunnel"; url: string; filename: string }
	| { status: "picker"; picker: { type: "photo"; url: string }[] }
	| { status: "local-processing" }
	| { status: "error"; error: { code: string } };

function buildCobaltHeaders() {
	const headers = new Headers({
		"Content-Type": "application/json",
		Accept: "application/json",
	});

	if (APP_ENV.COBALT_API_KEY) {
		headers.set("Authorization", `Api-Key ${APP_ENV.COBALT_API_KEY}`);
	}

	if (APP_ENV.COBALT_AZURE_FUNCTION_KEY) {
		headers.set("x-functions-key", APP_ENV.COBALT_AZURE_FUNCTION_KEY);
	}

	return headers;
}

export async function downloadMedia(
	url: string,
	tempDir: string,
): Promise<DownloadMediaResult | null> {
	const filenames: string[] = [];
	try {
		const directUrl = await fetch(APP_ENV.COBALT_API_URL, {
			method: "POST",
			headers: buildCobaltHeaders(),
			body: JSON.stringify({ url, localProcessing: "disabled" }),
		});

		if (!directUrl.ok) {
			console.warn("[Cobalt] Failed to prepare media", {
				url,
				status: directUrl.status,
				statusText: directUrl.statusText,
			});
			return null;
		}

		const body = (await directUrl.json()) as CobaltResponse;

		if (body.status === "error") {
			console.warn("[Cobalt] API returned an error", {
				url,
				code: body.error.code,
			});
			return null;
		}

		if (body.status === "local-processing") {
			console.warn("[Cobalt] API requested local processing", { url });
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

			return {
				type: "multiple",
				filenames,
				mediaKind: "image",
				publicUrls: body.picker.map((item) => item.url),
			};
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
			publicUrl: body.url,
			extension,
		};
	} catch (error) {
		console.log("Cobalt failed to prepare media", error);
		return null;
	}
}
