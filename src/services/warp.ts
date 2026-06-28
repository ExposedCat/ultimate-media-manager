import { APP_ENV } from "../config/env.ts";

const proxy = APP_ENV.WARP_PROXY;

const PROXY_RETRY_ATTEMPTS = 10;
const PROXY_RETRY_DELAY_MS = 1000;

export const warpProxy: string | undefined = proxy;

export const warpFetch: typeof fetch | undefined = proxy
	? warpClientFetch(proxy)
	: undefined;

function warpClientFetch(url: string): typeof fetch {
	const client = Deno.createHttpClient({ proxy: { url } });
	return async (input, init) => {
		for (let attempt = 1; attempt < PROXY_RETRY_ATTEMPTS; attempt++) {
			try {
				return await fetch(input, { ...init, client });
			} catch {
				await new Promise((resolve) =>
					setTimeout(resolve, PROXY_RETRY_DELAY_MS),
				);
			}
		}
		return await fetch(input, { ...init, client });
	};
}
