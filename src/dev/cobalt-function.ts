const DEFAULT_PORT = 7071;
const DEFAULT_ROUTE = "/api/cobalt";
const DEFAULT_UPSTREAM_URL = "http://127.0.0.1:9000";

function optionalEnv(name: string) {
	const value = Deno.env.get(name);
	return value?.trim() ? value : undefined;
}

function normalizePath(path: string) {
	return path.startsWith("/") ? path : `/${path}`;
}

function normalizeEndpoint(url: string) {
	return url.endsWith("/") ? url.slice(0, -1) : url;
}

const port = Number(optionalEnv("LOCAL_COBALT_FUNCTION_PORT") ?? DEFAULT_PORT);
const route = normalizePath(
	optionalEnv("LOCAL_COBALT_FUNCTION_ROUTE") ?? DEFAULT_ROUTE,
);
const upstreamUrl = normalizeEndpoint(
	optionalEnv("LOCAL_COBALT_UPSTREAM_URL") ?? DEFAULT_UPSTREAM_URL,
);
const functionKey = optionalEnv("COBALT_AZURE_FUNCTION_KEY");
const cobaltApiKey = optionalEnv("COBALT_API_KEY");

console.info("[LocalCobaltFunction] Listening", {
	port,
	route,
	upstreamUrl,
	functionKeyRequired: Boolean(functionKey),
});

Deno.serve({ port }, async (request) => {
	const requestUrl = new URL(request.url);

	if (requestUrl.pathname === "/" && request.method === "GET") {
		return Response.json({ ok: true, route, upstreamUrl });
	}

	if (requestUrl.pathname !== route) {
		return Response.json({ error: "not_found" }, { status: 404 });
	}

	if (request.method !== "POST") {
		return Response.json({ error: "method_not_allowed" }, { status: 405 });
	}

	if (
		functionKey &&
		request.headers.get("x-functions-key") !== functionKey &&
		requestUrl.searchParams.get("code") !== functionKey
	) {
		return Response.json({ error: "unauthorized" }, { status: 401 });
	}

	const headers = new Headers({
		"Content-Type": request.headers.get("Content-Type") ?? "application/json",
		Accept: request.headers.get("Accept") ?? "application/json",
	});

	if (cobaltApiKey) {
		headers.set("Authorization", `Api-Key ${cobaltApiKey}`);
	}

	try {
		const upstreamResponse = await fetch(upstreamUrl, {
			method: "POST",
			headers,
			body: await request.text(),
		});

		return new Response(await upstreamResponse.arrayBuffer(), {
			status: upstreamResponse.status,
			statusText: upstreamResponse.statusText,
			headers: {
				"Content-Type":
					upstreamResponse.headers.get("Content-Type") ?? "application/json",
			},
		});
	} catch (error) {
		console.error("[LocalCobaltFunction] Upstream request failed", {
			upstreamUrl,
			error,
		});
		return Response.json({ error: "upstream_unavailable" }, { status: 502 });
	}
});
