import type { UpdateResult } from "mongodb";

import type {
	Chat,
	Database,
	Settings,
	UserSettings,
} from "../types/database.ts";

export const DEFAULT_SETTINGS: Settings = {
	slideshowDelay: 1,
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
		return {
			...chat.value,
			settings: { ...DEFAULT_SETTINGS, ...chat.value.settings },
		};
	}

	return createChat(args);
}

export function setChatSetting<K extends keyof Settings>(args: {
	db: Database;
	chatId: number;
	key: K;
	value: Settings[K];
}): Promise<UpdateResult> {
	return args.db.chat.updateOne(
		{ chatId: args.chatId },
		{ $set: { [`settings.${args.key}`]: args.value } },
	);
}

export async function getUserSettings(args: {
	db: Database;
	userId: number;
}): Promise<UserSettings | null> {
	const user = await args.db.userSettings.findOne({ userId: args.userId });
	return user
		? { ...user, settings: { ...DEFAULT_SETTINGS, ...user.settings } }
		: null;
}

async function createUserSettings(args: {
	db: Database;
	userId: number;
}): Promise<UserSettings> {
	const userSettings: UserSettings = {
		userId: args.userId,
		settings: { ...DEFAULT_SETTINGS },
	};

	await args.db.userSettings.insertOne(userSettings);

	return userSettings;
}

export async function getOrCreateUserSettings(args: {
	db: Database;
	userId: number;
}): Promise<UserSettings> {
	const userSettings = await getUserSettings(args);
	if (userSettings) {
		return userSettings;
	}

	return createUserSettings(args);
}

export function setUserSetting<K extends keyof Settings>(args: {
	db: Database;
	userId: number;
	key: K;
	value: Settings[K];
}): Promise<UpdateResult> {
	return args.db.userSettings.updateOne(
		{ userId: args.userId },
		{ $set: { [`settings.${args.key}`]: args.value } },
	);
}
