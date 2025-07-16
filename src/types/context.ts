import type { I18nContextFlavor, TemplateData } from "@grammyjs/i18n";
import type { Context, SessionFlavor } from "grammy";

import type { Chat, Database } from "./database.js";
import type { Extra } from "./telegram.js";

export type CustomContextFields = {
	text: (
		text: string,
		templateData?: TemplateData,
		extra?: Extra,
	) => ReturnType<Context["reply"]>;

	objects: { chat: Chat | null };

	db: Database;
};

export type CustomContext = Context &
	CustomContextFields &
	I18nContextFlavor &
	SessionFlavor<unknown>;
