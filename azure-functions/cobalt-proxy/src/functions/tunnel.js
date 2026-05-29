import { app } from "@azure/functions";
import { ensureCobaltStarted, getCobaltUrl } from "../cobalt-server.js";

const FORWARDED_HEADERS = [
	"accept-ranges",
	"content-disposition",
	"content-length",
	"content-range",
	"content-type",
	"estimated-content-length",
];

function getForwardHeaders(response) {
	const headers = {};

	for (const name of FORWARDED_HEADERS) {
		const value = response.headers.get(name);
		if (value) {
			headers[name] = value;
		}
	}

	return headers;
}

function getPublicApiUrl(request) {
	return `${new URL(request.url).origin}/`;
}

app.http("tunnel", {
	methods: ["GET"],
	authLevel: "anonymous",
	route: "tunnel",
	handler: async (request, context) => {
		await ensureCobaltStarted(context, getPublicApiUrl(request));

		const requestUrl = new URL(request.url);
		const tunnelUrl = `${getCobaltUrl()}/tunnel${requestUrl.search}`;
		const headers = {};
		const range = request.headers.get("range");
		if (range) {
			headers.range = range;
		}

		try {
			const response = await fetch(tunnelUrl, { headers });

			return {
				status: response.status,
				headers: getForwardHeaders(response),
				body: Buffer.from(await response.arrayBuffer()),
			};
		} catch (error) {
			context.error("[CobaltFunction] Tunnel request failed", {
				tunnelUrl,
				error,
			});

			return {
				status: 502,
				jsonBody: { error: "tunnel_unavailable" },
			};
		}
	},
});
