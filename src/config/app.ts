// TODO: Use path aliases
import type { RunnerHandle } from "@grammyjs/runner";
import type { MongoClient } from "mongodb";

import { startBot } from "./bot.ts";
import { connectToDb } from "./database.ts";
import { APP_ENV } from "./env.ts";
import { startHealthServer, stopHealthServer } from "./health.ts";

function setupShutdown(
	runner: RunnerHandle,
	client: MongoClient,
	healthServer: Deno.HttpServer,
) {
	let isShuttingDown = false;

	const shutdown = async () => {
		if (isShuttingDown) {
			return;
		}
		isShuttingDown = true;

		try {
			await stopHealthServer(healthServer);
			await runner.stop();
			await client.close();
			Deno.exit(0);
		} catch (error) {
			console.error("Error occurred while stopping the app:", error);
			Deno.exit(1);
		}
	};

	Deno.addSignalListener("SIGINT", () => void shutdown());
	Deno.addSignalListener("SIGTERM", () => void shutdown());
}

export async function startApp() {
	try {
		void APP_ENV;
	} catch (error) {
		console.error("Error occurred while loading environment:", error);
		Deno.exit(1);
	}

	try {
		const { database, client } = await connectToDb();
		try {
			const runner = await startBot(database);
			const healthServer = startHealthServer();
			setupShutdown(runner, client, healthServer);
			runner.task()?.catch((error) => {
				console.error("Error occurred while running the bot:", error);
				Deno.exit(3);
			});
		} catch (error) {
			console.error("Error occurred while starting the bot:", error);
			Deno.exit(3);
		}
	} catch (error) {
		console.error("Error occurred while connecting to the database:", error);
		Deno.exit(2);
	}
}
