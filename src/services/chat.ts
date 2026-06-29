import type { UpdateResult } from "mongodb";

import type { Chat, Database, Settings } from "../types/database.ts";

export const DEFAULT_SETTINGS: Settings = {
	cleanup: true,
	captionReddit: true,
	captionSoundcloud: true,
	captionInstagram: true,
	captionTiktok: true,
	captionTwitter: true,
	captionYoutube: true,
	captionPinterest: true,
	errors: false,
};

async function createChat(args: {
	db: Database;
	chatId: number;
	title: string;
}): Promise<Chat> {
	const chatObject: Chat = {
		chatId: args.chatId,
		title: args.title,
		settings: { ...DEFAULT_SETTINGS },
	};

	await args.db.chat.insertOne(chatObject);

	return chatObject;
}

export async function getOrCreateChat(args: {
	db: Database;
	chatId: number;
	title: string;
}): Promise<Chat> {
	const chat = await args.db.chat.findOneAndUpdate(
		{ chatId: args.chatId },
		{ $set: { title: args.title } },
		{ returnDocument: "after" },
	);

	if (chat.ok && chat.value) {
		return chat.value;
	}

	return createChat(args);
}

export function setChatSetting(args: {
	db: Database;
	chatId: number;
	key: keyof Settings;
	value: boolean;
}): Promise<UpdateResult> {
	return args.db.chat.updateOne(
		{ chatId: args.chatId },
		{ $set: { [`settings.${args.key}`]: args.value } },
	);
}
