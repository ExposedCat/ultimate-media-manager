export declare global {
	namespace NodeJS {
		interface ProcessEnv {
			TOKEN: string;
			DB_CONNECTION_STRING: string;
			CACHE_CHAT_ID: string;
			COBALT_API_URL: string;
			SEARXNG_API_URL: string;
		}
	}
}
