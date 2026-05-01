import { connectToDb } from "../config/database.ts";
import { APP_ENV } from "../config/env.ts";
import type { Database } from "../types/database.ts";

void APP_ENV;

async function migrate(database: Database) {
	await database.chat.updateMany({}, { $set: { settings: { cleanup: true } } });
}

console.info("Connecting…");
const { database, client } = await connectToDb();
console.info("Running migration…");
await migrate(database);
console.info("Disconnecting…");
await client.close();
console.info("Done");
