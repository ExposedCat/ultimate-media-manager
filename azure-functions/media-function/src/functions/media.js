import { app } from "@azure/functions";
import { downloadWithPostfetch } from "../postfetch.js";
import { downloadWithYtdlp } from "../ytdlp.js";

const BUNDLE_CONTENT_TYPE = "application/x-umm-media-bundle";

function formatErrorMessage(error) {
	return error instanceof Error ? error.message : String(error);
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

function bundleResponse(files) {
	return {
		status: 200,
		headers: {
			"Content-Type": BUNDLE_CONTENT_TYPE,
		},
		body: createBundle(files),
	};
}

app.http("media", {
	methods: ["POST"],
	authLevel: "function",
	route: "api/media",
	handler: async (request, context) => {
		const requestBody = await request.text();

		try {
			return bundleResponse(await downloadWithPostfetch(requestBody, context));
		} catch (error) {
			context.warn("[MediaFunction] postfetch failed; falling back to yt-dlp", {
				error: formatErrorMessage(error),
			});
		}

		try {
			return bundleResponse(await downloadWithYtdlp(requestBody, context));
		} catch (error) {
			context.error("[MediaFunction] yt-dlp failed", {
				error: formatErrorMessage(error),
			});

			return {
				status: 502,
				jsonBody: { error: "media_unavailable" },
			};
		}
	},
});
