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
	await fs.writeFile(path, Buffer.from(buffer));

	return path;
}

export async function downloadMedia(
	url: string,
	pathPrefix: string,
): Promise<
	| { type: "single"; filename: string }
	| { type: "multiple"; filenames: string[] }
	| null
> {
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

		const targets =
			body.status === "picker"
				? body.picker.map((item) => item.url)
				: [body.url];

		const responses = await Promise.all(targets.map((target) => fetch(target)));
		const buffers = await Promise.all(
			responses.map((response) => response.arrayBuffer()),
		);

		const results = buffers.map(
			(buffer, index) =>
				[
					body.status === "picker"
						? `${pathPrefix}-${index}.jpg`
						: `${pathPrefix}-${body.filename}`,
					buffer,
				] as const,
		);

		for (const [path, buffer] of results) {
			await fs.writeFile(path, Buffer.from(buffer));
		}

		return results.length === 1
			? { type: "single", filename: results[0][0] }
			: { type: "multiple", filenames: results.map(([filename]) => filename) };
	} catch {
		return null;
	}
}
