import { APP_ENV } from "../config/env.ts";

const proxy = APP_ENV.WARP_PROXY;

export const warpProxy: string | undefined = proxy;

export const warpFetch: typeof fetch | undefined = proxy
	? warpClientFetch(proxy)
	: undefined;

function warpClientFetch(url: string): typeof fetch {
	const client = Deno.createHttpClient({ proxy: { url } });
	return (input, init) => fetch(input, { ...init, client });
}
