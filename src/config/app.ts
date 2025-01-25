// TODO: Use path aliases
import env from "dotenv";

import { resolvePath } from "../helpers/resolve-path.js";
import { validateEnv } from "../helpers/validate-env.js";
import { startBot } from "./bot.js";
import { connectToDb } from "./database.js";

export async function startApp() {
	try {
		env.config({
			path: resolvePath(import.meta.url, "../../.env"),
		});
		validateEnv(["TOKEN", "DB_CONNECTION_STRING"]);
	} catch (error) {
		console.error("Error occurred while loading environment:", error);
		process.exit(1);
	}

	try {
		const { database } = await connectToDb();
		try {
			await startBot(database);
		} catch (error) {
			console.error("Error occurred while starting the bot:", error);
			process.exit(3);
		}
	} catch (error) {
		console.error("Error occurred while connecting to the database:", error);
		process.exit(2);
	}
}
