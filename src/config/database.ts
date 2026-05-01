import { MongoClient } from "mongodb";

import type { Chat, Database } from "../types/database.ts";
import { APP_ENV } from "./env.ts";

export async function connectToDb() {
	const client = new MongoClient(APP_ENV.DB_CONNECTION_STRING);
	await client.connect();
	const mongoDb = client.db();
	const chat = mongoDb.collection<Chat>("chat");
	const database: Database = { chat };
	return { database, client };
}
