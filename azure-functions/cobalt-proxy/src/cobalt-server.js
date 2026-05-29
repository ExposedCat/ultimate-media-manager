const COBALT_PORT = Number(process.env.COBALT_INTERNAL_PORT ?? 9000);
const COBALT_URL = `http://127.0.0.1:${COBALT_PORT}`;

let startPromise;

export function getCobaltUrl() {
	return COBALT_URL;
}

export async function ensureCobaltStarted(context, publicApiUrl) {
	if (startPromise) {
		return startPromise;
	}

	startPromise = startCobalt(context, publicApiUrl);
	return startPromise;
}

async function startCobalt(context, publicApiUrl) {
	process.env.API_URL = publicApiUrl;
	process.env.API_PORT ??= String(COBALT_PORT);
	process.env.API_LISTEN_ADDRESS ??= "127.0.0.1";
	process.env.API_INSTANCE_COUNT ??= "1";
	process.env.API_AUTH_REQUIRED ??= "0";
	process.env.CORS_WILDCARD ??= "1";
	process.env.RATELIMIT_MAX ??= "200";
	process.env.TUNNEL_RATELIMIT_MAX ??= "400";

	context.log("[CobaltFunction] Starting embedded Cobalt API", {
		apiUrl: process.env.API_URL,
		apiPort: process.env.API_PORT,
	});

	await import("cobalt/api/src/cobalt.js");
	await waitForCobalt();

	context.log("[CobaltFunction] Embedded Cobalt API is ready");
}

async function waitForCobalt() {
	const deadline = Date.now() + 25_000;
	let lastError;

	while (Date.now() < deadline) {
		try {
			const response = await fetch(`${COBALT_URL}/`, {
				headers: { Accept: "application/json" },
			});

			if (response.ok) {
				return;
			}
		} catch (error) {
			lastError = error;
		}

		await new Promise((resolve) => setTimeout(resolve, 250));
	}

	throw new Error(`Embedded Cobalt API did not start: ${lastError}`);
}
