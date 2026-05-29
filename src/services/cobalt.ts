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
const EXTENSIONS_BY_CONTENT_TYPE = new Map([
	["image/jpeg", "jpg"],
	["image/png", "png"],
	["image/webp", "webp"],
	["image/gif", "gif"],
	["video/mp4", "mp4"],
	["audio/mpeg", "mp3"],
	["audio/wav", "wav"],
	["audio/ogg", "ogg"],
	["audio/mp4", "m4a"],
]);

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

function getExtensionFromUrl(url: string) {
	try {
		const pathname = new URL(url).pathname;
		return pathname.split(".").at(-1)?.toLowerCase() ?? "";
	} catch {
		return "";
	}
}

function sanitizeFilename(filename: string) {
	return filename.replaceAll("/", "_").replaceAll("\\", "_");
}

function getExtension(response: Response, url: string, fallback: string) {
	const contentType = response.headers
		.get("Content-Type")
		?.split(";")[0]
		.trim();
	if (contentType) {
		const extension = EXTENSIONS_BY_CONTENT_TYPE.get(contentType);
		if (extension) {
			return extension;
		}
	}

	return getExtensionFromUrl(url) || fallback;
}

async function downloadFile(
	url: string,
	filename: string,
): Promise<string | null> {
	const response = await fetch(url);
	if (!response.ok) {
		console.warn("[Cobalt] Failed to download prepared media URL", {
			url,
			status: response.status,
			statusText: response.statusText,
		});
		return null;
	}

	const buffer = await response.arrayBuffer();
	if (buffer.byteLength === 0) {
		console.warn("[Cobalt] Prepared media URL returned an empty body", { url });
		return null;
	}

	await Deno.writeFile(filename, new Uint8Array(buffer));
	return filename;
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
			for (const [index, item] of body.picker.entries()) {
				const response = await fetch(item.url);
				if (!response.ok) {
					console.warn("[Cobalt] Failed to download picker image", {
						url: item.url,
						status: response.status,
						statusText: response.statusText,
					});
					continue;
				}

				const buffer = await response.arrayBuffer();
				if (buffer.byteLength === 0) {
					console.warn("[Cobalt] Picker image returned an empty body", {
						url: item.url,
					});
					continue;
				}

				const extension = getExtension(response, item.url, "jpg");
				const filename = `${tempDir}/${index}.${extension}`;
				await Deno.writeFile(filename, new Uint8Array(buffer));
				filenames.push(filename);
			}

			if (filenames.length === 0) {
				console.warn(
					"[Cobalt] Picker did not produce any downloadable images",
					{
						url,
						imageCount: body.picker.length,
					},
				);
				return null;
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

		const filename = `${tempDir}/${sanitizeFilename(body.filename)}`;
		const downloadedFilename = await downloadFile(body.url, filename);
		if (!downloadedFilename) {
			return null;
		}

		filenames.push(filename);

		return {
			type: "single",
			filename: downloadedFilename,
			mediaKind: isImage ? "image" : isAudio ? "audio" : "video",
			publicUrl: body.url,
			extension,
		};
	} catch (error) {
		console.log("Cobalt failed to prepare media", error);
		return null;
	}
}
