import { APP_ENV } from "../config/env.ts";

export type DownloadMediaResult =
	| {
			type: "single";
			file: DownloadMediaFile;
			mediaKind: "image" | "video" | "audio";
			extension: string;
	  }
	| {
			type: "multiple";
			files: DownloadMediaFile[];
			mediaKind: "image";
	  };

export type DownloadMediaFile = {
	contentType?: string;
	data: Uint8Array;
	extension: string;
	filename: string;
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

type CobaltBundleManifest = {
	status: "bundle";
	files: {
		filename: string;
		contentType: string;
		size: number;
		offset: number;
	}[];
};

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

function sanitizeFilename(filename: string) {
	return filename.replaceAll("/", "_").replaceAll("\\", "_");
}

function getExtensionFromFilename(filename: string) {
	return filename.split(".").at(-1)?.toLowerCase() ?? "";
}

function getExtensionFromContentType(contentType: string) {
	return EXTENSIONS_BY_CONTENT_TYPE.get(contentType.split(";")[0].trim()) ?? "";
}

function getMediaKind(extension: string) {
	const isImage = IMAGE_EXTENSIONS.includes(extension);
	const isAudio = AUDIO_EXTENSIONS.includes(extension);
	return isImage ? "image" : isAudio ? "audio" : "video";
}

async function parseBundleResponse(
	response: Response,
): Promise<DownloadMediaResult | null> {
	const buffer = await response.arrayBuffer();
	if (buffer.byteLength < 4) {
		console.warn("[Cobalt] Bundle response was too small");
		return null;
	}

	const view = new DataView(buffer);
	const manifestLength = view.getUint32(0);
	const manifestStart = 4;
	const manifestEnd = manifestStart + manifestLength;
	if (manifestEnd > buffer.byteLength) {
		console.warn("[Cobalt] Bundle manifest length exceeded response size", {
			manifestLength,
			responseSize: buffer.byteLength,
		});
		return null;
	}

	const manifest = JSON.parse(
		new TextDecoder().decode(buffer.slice(manifestStart, manifestEnd)),
	) as CobaltBundleManifest;
	if (manifest.status !== "bundle" || manifest.files.length === 0) {
		console.warn("[Cobalt] Bundle manifest did not contain files");
		return null;
	}

	const files: DownloadMediaFile[] = [];
	for (const [index, file] of manifest.files.entries()) {
		const fileStart = manifestEnd + file.offset;
		const fileEnd = fileStart + file.size;
		if (fileEnd > buffer.byteLength || file.size <= 0) {
			console.warn("[Cobalt] Bundle file range was invalid", {
				index,
				filename: file.filename,
				size: file.size,
				offset: file.offset,
			});
			continue;
		}

		const extension =
			getExtensionFromFilename(file.filename) ||
			getExtensionFromContentType(file.contentType) ||
			"bin";
		const filename = `${index}-${sanitizeFilename(file.filename || `media.${extension}`)}`;
		files.push({
			contentType: file.contentType,
			data: new Uint8Array(buffer.slice(fileStart, fileEnd)),
			extension,
			filename,
		});
	}

	if (files.length === 0) {
		return null;
	}

	if (files.length > 1) {
		return {
			type: "multiple",
			files,
			mediaKind: "image",
		};
	}

	const file = files[0];
	return {
		type: "single",
		file,
		mediaKind: getMediaKind(file.extension),
		extension: file.extension,
	};
}

export async function downloadMedia(
	url: string,
): Promise<DownloadMediaResult | null> {
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

		const contentType = directUrl.headers.get("Content-Type") ?? "";
		if (
			contentType.split(";")[0].trim() !== "application/x-umm-cobalt-bundle"
		) {
			console.warn("[Cobalt] API returned unsupported response type", {
				url,
				contentType,
			});
			return null;
		}

		return await parseBundleResponse(directUrl);
	} catch (error) {
		console.log("Cobalt failed to prepare media", error);
		return null;
	}
}
