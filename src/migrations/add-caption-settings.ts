import { connectToDb } from "../config/database.ts";
import { APP_ENV } from "../config/env.ts";
import { DEFAULT_SETTINGS } from "../services/chat.ts";
import type { Database } from "../types/database.ts";

void APP_ENV;

async function migrate(database: Database) {
	await database.chat.updateMany(
		{},
		{
			$set: {
				"settings.captionReddit": DEFAULT_SETTINGS.captionReddit,
				"settings.captionSoundcloud": DEFAULT_SETTINGS.captionSoundcloud,
				"settings.captionInstagram": DEFAULT_SETTINGS.captionInstagram,
				"settings.captionTiktok": DEFAULT_SETTINGS.captionTiktok,
				"settings.captionTwitter": DEFAULT_SETTINGS.captionTwitter,
				"settings.captionYoutube": DEFAULT_SETTINGS.captionYoutube,
				"settings.captionPinterest": DEFAULT_SETTINGS.captionPinterest,
				"settings.errors": DEFAULT_SETTINGS.errors,
			},
		},
	);
}

console.info("Connecting…");
const { database, client } = await connectToDb();
console.info("Running migration…");
await migrate(database);
console.info("Disconnecting…");
await client.close();
console.info("Done");
