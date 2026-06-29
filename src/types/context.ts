import type { I18nContextFlavor, TemplateData } from "@grammyjs/i18n";
import type { Context, SessionFlavor } from "grammy";

import type { Chat, Database, UserSettings } from "./database.ts";
import type { Extra } from "./telegram.ts";

export type ContextObjects = {
	chat: Chat | null;
	user: UserSettings | null;
	guestReceiverUser: UserSettings | null;
	guestSenderUser: UserSettings | null;
};

export type CustomContextFields = {
	text: (
		text: string,
		templateData?: TemplateData,
		extra?: Extra,
	) => ReturnType<Context["reply"]>;

	objects: ContextObjects;

	db: Database;
};

export type CustomContext = Context &
	CustomContextFields &
	I18nContextFlavor &
	SessionFlavor<unknown>;
