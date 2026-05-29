import { app } from "@azure/functions";
import { ensureCobaltStarted, getCobaltUrl } from "../cobalt-server.js";

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
