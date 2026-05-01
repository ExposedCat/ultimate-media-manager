function requireEnv(name: string) {
	const value = Deno.env.get(name);
	if (value === undefined) {
		throw new Error(`ERROR: Required variable "${name}" is  not specified`);
	}
	return value;
}

export const APP_ENV = {
	TOKEN: requireEnv("TOKEN"),
	DB_CONNECTION_STRING: requireEnv("DB_CONNECTION_STRING"),
	CACHE_CHAT_ID: requireEnv("CACHE_CHAT_ID"),
	COBALT_API_URL: requireEnv("COBALT_API_URL"),
	SEARXNG_API_URL: requireEnv("SEARXNG_API_URL"),
};
