import { MongoClient } from "mongodb";

import type { Chat, Database, UserSettings } from "../types/database.ts";
import { APP_ENV } from "./env.ts";

export async function connectToDb() {
	const client = new MongoClient(APP_ENV.DB_CONNECTION_STRING);
	await client.connect();
	const mongoDb = client.db();
	const chat = mongoDb.collection<Chat>("chat");
	const userSettings = mongoDb.collection<UserSettings>("userSettings");
	const database: Database = { chat, userSettings };
	return { database, client };
}
