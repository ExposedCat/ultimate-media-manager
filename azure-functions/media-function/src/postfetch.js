import { download, postfetch } from "@postfetch/core";

function parseRequestUrl(requestBody) {
	const parsed = JSON.parse(requestBody);
	const url = typeof parsed.url === "string" ? parsed.url.trim() : "";
	if (!url) {
		throw new Error("request body did not contain a URL");
	}

	return url;
}

export async function downloadWithPostfetch(requestBody, context) {
	const url = parseRequestUrl(requestBody);
	const result = await postfetch(url);
	const files = await Promise.all(
		result.items.map(async (item) => {
			const response = await download(item);
			return {
				filename: item.filename,
				contentType: item.mime,
				data: Buffer.from(await response.arrayBuffer()),
			};
		}),
	);
	if (files.length === 0) {
		throw new Error("postfetch did not resolve any media");
	}

	context.log("[MediaFunction] postfetch resolved media", {
		platform: result.platform,
		fileCount: files.length,
		url,
	});

	return files;
}
