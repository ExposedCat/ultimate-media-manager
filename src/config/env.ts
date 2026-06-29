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
	ADMIN_ID: optionalEnv("ADMIN_ID"),
	WARP_PROXY: optionalEnv("WARP_PROXY"),
	YT_DLP_PATH: Deno.env.get("YT_DLP_PATH") ?? "yt-dlp",
	FFMPEG_PATH: Deno.env.get("FFMPEG_PATH") ?? "ffmpeg",
};
