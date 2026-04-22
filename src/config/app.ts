// TODO: Use path aliases
import type { RunnerHandle } from "@grammyjs/runner";
import env from "dotenv";
import type { MongoClient } from "mongodb";

import { resolvePath } from "../helpers/resolve-path.js";
import { validateEnv } from "../helpers/validate-env.js";
import { startBot } from "./bot.js";
import { connectToDb } from "./database.js";

function setupShutdown(runner: RunnerHandle, client: MongoClient) {
	const shutdown = async () => {
		try {
			await runner.stop();
			await client.close();
			process.exit(0);
		} catch (error) {
			console.error("Error occurred while stopping the app:", error);
			process.exit(1);
		}
	};

	process.once("SIGINT", shutdown);
	process.once("SIGTERM", shutdown);
}

export async function startApp() {
	try {
		env.config({
			path: resolvePath(import.meta.url, "../../.env"),
		});
		validateEnv([
			"TOKEN",
			"DB_CONNECTION_STRING",
			"CACHE_CHAT_ID",
			"COBALT_API_URL",
			"SEARXNG_API_URL",
		]);
	} catch (error) {
		console.error("Error occurred while loading environment:", error);
		process.exit(1);
	}

	try {
		const { database, client } = await connectToDb();
		try {
			const runner = await startBot(database);
			setupShutdown(runner, client);
			runner.task()?.catch((error) => {
				console.error("Error occurred while running the bot:", error);
				process.exit(3);
			});
		} catch (error) {
			console.error("Error occurred while starting the bot:", error);
			process.exit(3);
		}
	} catch (error) {
		console.error("Error occurred while connecting to the database:", error);
		process.exit(2);
	}
}
