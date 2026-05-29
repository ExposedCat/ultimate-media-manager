import { app } from "@azure/functions";
import { ensureCobaltStarted, getCobaltUrl } from "../cobalt-server.js";

const BUNDLE_CONTENT_TYPE = "application/x-umm-cobalt-bundle";

function optionalEnv(name) {
	const value = process.env[name];
	return value?.trim() || undefined;
}

function normalizeEndpoint(url) {
	return url.endsWith("/") ? url.slice(0, -1) : url;
}

function getPublicApiUrl(request) {
	return `${new URL(request.url).origin}/`;
}

function sanitizeFilename(filename) {
	return filename.replaceAll("/", "_").replaceAll("\\", "_");
}

function getExtensionFromUrl(url) {
	try {
		const pathname = new URL(url).pathname;
		return pathname.split(".").at(-1)?.toLowerCase() || "";
	} catch {
		return "";
	}
}

function getExtension(response, url, fallback) {
	const contentType = response.headers
		.get("content-type")
		?.split(";")[0]
		.trim();
	if (contentType === "image/jpeg") return "jpg";
	if (contentType === "image/png") return "png";
	if (contentType === "image/webp") return "webp";
	if (contentType === "image/gif") return "gif";
	if (contentType === "video/mp4") return "mp4";
	if (contentType === "audio/mpeg") return "mp3";
	if (contentType === "audio/wav") return "wav";
	if (contentType === "audio/ogg") return "ogg";
	if (contentType === "audio/mp4") return "m4a";
	return getExtensionFromUrl(url) || fallback;
}

function resolveInternalCobaltUrl(url) {
	const parsedUrl = new URL(url);
	if (parsedUrl.pathname === "/tunnel") {
		return `${getCobaltUrl()}${parsedUrl.pathname}${parsedUrl.search}`;
	}

	return url;
}

async function downloadResolvedFile(url, filename) {
	const response = await fetch(resolveInternalCobaltUrl(url));
	if (!response.ok) {
		throw new Error(
			`failed to download resolved media: ${response.status} ${response.statusText}`,
		);
	}

	const buffer = Buffer.from(await response.arrayBuffer());
	if (buffer.length === 0) {
		throw new Error("resolved media was empty");
	}

	return {
		filename,
		contentType:
			response.headers.get("content-type") ?? "application/octet-stream",
		data: buffer,
	};
}

function createBundle(files) {
	const manifestFiles = [];
	let offset = 0;

	for (const file of files) {
		manifestFiles.push({
			filename: file.filename,
			contentType: file.contentType,
			size: file.data.length,
			offset,
		});
		offset += file.data.length;
	}

	const manifest = Buffer.from(
		JSON.stringify({
			status: "bundle",
			files: manifestFiles,
		}),
		"utf8",
	);
	const manifestLength = Buffer.alloc(4);
	manifestLength.writeUInt32BE(manifest.length, 0);

	return Buffer.concat([
		manifestLength,
		manifest,
		...files.map((file) => file.data),
	]);
}

async function resolveCobaltResponse(responseBody) {
	if (
		responseBody.status === "error" ||
		responseBody.status === "local-processing"
	) {
		return responseBody;
	}

	if (responseBody.status === "picker") {
		const files = [];

		for (const [index, item] of responseBody.picker.entries()) {
			const response = await fetch(resolveInternalCobaltUrl(item.url));
			if (!response.ok) {
				throw new Error(
					`failed to download picker item: ${response.status} ${response.statusText}`,
				);
			}

			const data = Buffer.from(await response.arrayBuffer());
			if (data.length === 0) {
				throw new Error("picker item was empty");
			}

			const extension = getExtension(response, item.url, "jpg");
			files.push({
				filename: `${index}.${extension}`,
				contentType:
					response.headers.get("content-type") ?? "application/octet-stream",
				data,
			});
		}

		return { bundle: createBundle(files) };
	}

	if (responseBody.status === "redirect" || responseBody.status === "tunnel") {
		const file = await downloadResolvedFile(
			responseBody.url,
			sanitizeFilename(responseBody.filename ?? "media"),
		);
		return { bundle: createBundle([file]) };
	}

	throw new Error(`unsupported cobalt response status: ${responseBody.status}`);
}

app.http("cobalt", {
	methods: ["POST"],
	authLevel: "function",
	route: "api/cobalt",
	handler: async (request, context) => {
		await ensureCobaltStarted(context, getPublicApiUrl(request));

		const cobaltApiUrl = normalizeEndpoint(getCobaltUrl());
		const cobaltApiKey = optionalEnv("COBALT_API_KEY");
		const headers = {
			"Content-Type": request.headers.get("content-type") ?? "application/json",
			Accept: request.headers.get("accept") ?? "application/json",
		};

		if (cobaltApiKey) {
			headers.Authorization = `Api-Key ${cobaltApiKey}`;
		}

		try {
			const upstreamResponse = await fetch(cobaltApiUrl, {
				method: "POST",
				headers,
				body: await request.text(),
			});
			const cobaltResponse = await upstreamResponse.json();
			const resolved = await resolveCobaltResponse(cobaltResponse);

			if ("bundle" in resolved) {
				return {
					status: 200,
					headers: {
						"Content-Type": BUNDLE_CONTENT_TYPE,
					},
					body: resolved.bundle,
				};
			}

			return {
				status: upstreamResponse.status,
				headers: {
					"Content-Type": "application/json",
				},
				jsonBody: resolved,
			};
		} catch (error) {
			context.error("[CobaltFunction] Upstream request failed", {
				cobaltApiUrl,
				error,
			});

			return {
				status: 502,
				jsonBody: { error: "upstream_unavailable" },
			};
		}
	},
});
