import type { Collection } from "mongodb";

export type Settings = {
	/** Allowed original X text languages, ordered by translation preference. */
	languages: string[];
	/** Seconds per slideshow item. Zero disables video conversion. */
	slideshowDelay: number;
	cleanup: boolean;
	captionReddit: boolean;
	captionSoundcloud: boolean;
	captionInstagram: boolean;
	captionTiktok: boolean;
	captionTwitter: boolean;
	captionYoutube: boolean;
	captionPinterest: boolean;
	errors: boolean;
};

export type Chat = {
	chatId: number;
	title: string;
	settings: Settings;
};

export type UserSettings = {
	userId: number;
	settings: Settings;
};

export type Database = {
	chat: Collection<Chat>;
	userSettings: Collection<UserSettings>;
};
