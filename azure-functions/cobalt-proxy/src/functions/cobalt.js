import { app } from "@azure/functions";
import { ensureCobaltStarted, getCobaltUrl } from "../cobalt-server.js";
import { downloadWithYtdlp } from "../ytdlp.js";

const BUNDLE_CONTENT_TYPE = "application/x-umm-cobalt-bundle";
const DOWNLOAD_TIMEOUT_MS = optionalPositiveIntegerEnv(
	"COBALT_DOWNLOAD_TIMEOUT_MS",
	120_000,
);
const DOWNLOAD_RETRIES = optionalNonNegativeIntegerEnv(
	"COBALT_DOWNLOAD_RETRIES",
	5,
);
const DOWNLOAD_RETRY_DELAY_MS = optionalPositiveIntegerEnv(
	"COBALT_DOWNLOAD_RETRY_DELAY_MS",
	1_000,
);

function optionalEnv(name) {
	const value = process.env[name];
	return value?.trim() || undefined;
}

function optionalPositiveIntegerEnv(name, fallback) {
	const value = Number.parseInt(process.env[name] ?? "", 10);
	return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

function optionalNonNegativeIntegerEnv(name, fallback) {
	const value = Number.parseInt(process.env[name] ?? "", 10);
	return Number.isSafeInteger(value) && value >= 0 ? value : fallback;
}

function normalizeEndpoint(url) {
	return url.endsWith("/") ? url.slice(0, -1) : url;
}

function truncateBody(body) {
	return body.length > 1000 ? `${body.slice(0, 1000)}...` : body;
}

function formatLogPayload(value) {
	return truncateBody(JSON.stringify(value));
}

function formatErrorMessage(error) {
	return error instanceof Error ? error.message : String(error);
}

async function readJsonResponse(response) {
	const body = await response.text();
	try {
		return JSON.parse(body);
	} catch (error) {
		throw new Error(
			`upstream returned invalid JSON: ${response.status} ${response.statusText} ${truncateBody(body)}`,
			{ cause: error },
		);
	}
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

function getUrlLogDetails(originalUrl, resolvedUrl) {
	const original = new URL(originalUrl);
	const resolved = new URL(resolvedUrl);
	return {
		originalOrigin: original.origin,
		originalPath: original.pathname,
		resolvedOrigin: resolved.origin,
		resolvedPath: resolved.pathname,
		internalTunnel:
			resolved.origin === getCobaltUrl() && resolved.pathname === "/tunnel",
	};
}

function isRetryableStatus(status) {
	return status === 408 || status === 429 || status >= 500;
}

async function wait(ms) {
	await new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchResolvedBuffer(url, purpose, context) {
	const resolvedUrl = resolveInternalCobaltUrl(url);
	const urlLogDetails = getUrlLogDetails(url, resolvedUrl);
	const attempts = DOWNLOAD_RETRIES + 1;
	let lastError;

	for (let attempt = 1; attempt <= attempts; attempt += 1) {
		const controller = new AbortController();
		const timeout = setTimeout(() => {
			controller.abort(
				new Error(
					`resolved media download timed out after ${DOWNLOAD_TIMEOUT_MS}ms`,
				),
			);
		}, DOWNLOAD_TIMEOUT_MS);

		try {
			const response = await fetch(resolvedUrl, {
				signal: controller.signal,
			});
			if (!response.ok) {
				const error = new Error(
					`failed to download ${purpose}: ${response.status} ${response.statusText}`,
				);
				error.retryable = isRetryableStatus(response.status);
				if (attempt < attempts && isRetryableStatus(response.status)) {
					lastError = error;
					context.warn("[CobaltFunction] Resolved media download retrying", {
						purpose,
						attempt,
						attempts,
						status: response.status,
						statusText: response.statusText,
						...urlLogDetails,
					});
					await wait(DOWNLOAD_RETRY_DELAY_MS);
					continue;
				}

				throw error;
			}

			return {
				response,
				data: Buffer.from(await response.arrayBuffer()),
			};
		} catch (error) {
			lastError = error;
			if (attempt < attempts && error?.retryable !== false) {
				context.warn("[CobaltFunction] Resolved media download retrying", {
					purpose,
					attempt,
					attempts,
					error: formatErrorMessage(error),
					...urlLogDetails,
				});
				await wait(DOWNLOAD_RETRY_DELAY_MS);
				continue;
			}

			break;
		} finally {
			clearTimeout(timeout);
		}
	}

	throw new Error(
		`failed to download ${purpose} from ${urlLogDetails.resolvedOrigin}${urlLogDetails.resolvedPath}: ${formatErrorMessage(lastError)}`,
		{ cause: lastError },
	);
}

async function downloadResolvedFile(url, filename, context) {
	const { response, data } = await fetchResolvedBuffer(
		url,
		"resolved media",
		context,
	);
	if (!response.ok) {
		throw new Error(
			`failed to download resolved media: ${response.status} ${response.statusText}`,
		);
	}

	if (data.length === 0) {
		throw new Error("resolved media was empty");
	}

	return {
		filename,
		contentType:
			response.headers.get("content-type") ?? "application/octet-stream",
		data,
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

async function resolveCobaltResponse(responseBody, context) {
	if (
		responseBody.status === "error" ||
		responseBody.status === "local-processing"
	) {
		return responseBody;
	}

	if (responseBody.status === "picker") {
		const files = [];

		for (const [index, item] of responseBody.picker.entries()) {
			const { response, data } = await fetchResolvedBuffer(
				item.url,
				"picker item",
				context,
			);
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
			context,
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
		const requestBody = await request.text();

		try {
			const files = await downloadWithYtdlp(requestBody, context);
			return {
				status: 200,
				headers: {
					"Content-Type": BUNDLE_CONTENT_TYPE,
				},
				body: createBundle(files),
			};
		} catch (error) {
			context.warn("[CobaltFunction] yt-dlp failed; falling back to Cobalt", {
				error: formatErrorMessage(error),
			});
		}

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
			await ensureCobaltStarted(context, getPublicApiUrl(request));

			const upstreamResponse = await fetch(cobaltApiUrl, {
				method: "POST",
				headers,
				body: requestBody,
			});
			const cobaltResponse = await readJsonResponse(upstreamResponse);
			if (!upstreamResponse.ok) {
				context.warn("[CobaltFunction] Upstream rejected request", {
					cobaltApiUrl,
					status: upstreamResponse.status,
					statusText: upstreamResponse.statusText,
					response: formatLogPayload(cobaltResponse),
				});
			}

			const resolved = await resolveCobaltResponse(cobaltResponse, context);

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
			context.error("[CobaltFunction] Cobalt request failed", {
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
