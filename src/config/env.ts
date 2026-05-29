function requireEnv(name: string) {
	const value = Deno.env.get(name);
	if (value === undefined) {
		throw new Error(`ERROR: Required variable "${name}" is  not specified`);
	}
	return value;
}

function optionalEnv(name: string) {
	const value = Deno.env.get(name);
	return value?.trim() ? value : undefined;
}

export const APP_ENV = {
	TOKEN: requireEnv("TOKEN"),
	DB_CONNECTION_STRING: requireEnv("DB_CONNECTION_STRING"),
	CACHE_CHAT_ID: requireEnv("CACHE_CHAT_ID"),
	COBALT_API_URL: requireEnv("COBALT_API_URL"),
	COBALT_API_KEY: optionalEnv("COBALT_API_KEY"),
	COBALT_AZURE_FUNCTION_KEY: optionalEnv("COBALT_AZURE_FUNCTION_KEY"),
	FFMPEG_PATH: Deno.env.get("FFMPEG_PATH") ?? "ffmpeg",
};
