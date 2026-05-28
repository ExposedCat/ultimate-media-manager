import { app } from "@azure/functions";

function requiredEnv(name) {
	const value = process.env[name];
	if (!value?.trim()) {
		throw new Error(`Required app setting "${name}" is not configured`);
	}
	return value;
}

function optionalEnv(name) {
	const value = process.env[name];
	return value?.trim() || undefined;
}

function normalizeEndpoint(url) {
	return url.endsWith("/") ? url.slice(0, -1) : url;
}

app.http("cobalt", {
	methods: ["POST"],
	authLevel: "function",
	route: "cobalt",
	handler: async (request, context) => {
		const upstreamUrl = normalizeEndpoint(requiredEnv("COBALT_UPSTREAM_URL"));
		const cobaltApiKey = optionalEnv("COBALT_API_KEY");
		const headers = {
			"Content-Type": request.headers.get("content-type") ?? "application/json",
			Accept: request.headers.get("accept") ?? "application/json",
		};

		if (cobaltApiKey) {
			headers.Authorization = `Api-Key ${cobaltApiKey}`;
		}

		try {
			const upstreamResponse = await fetch(upstreamUrl, {
				method: "POST",
				headers,
				body: await request.text(),
			});
			const body = Buffer.from(await upstreamResponse.arrayBuffer());

			return {
				status: upstreamResponse.status,
				headers: {
					"Content-Type":
						upstreamResponse.headers.get("content-type") ?? "application/json",
				},
				body,
			};
		} catch (error) {
			context.error("[CobaltFunction] Upstream request failed", {
				upstreamUrl,
				error,
			});

			return {
				status: 502,
				jsonBody: { error: "upstream_unavailable" },
			};
		}
	},
});
