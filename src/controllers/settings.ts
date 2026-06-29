import { Composer } from "grammy";

import { APP_ENV } from "../config/env.ts";
import { setChatSetting } from "../services/chat.ts";
import type { CustomContext } from "../types/context.ts";
import type { Settings } from "../types/database.ts";

type SettingOption = {
	key: keyof Settings;
	labelKey: string;
	adminOnly?: boolean;
};

const OPTIONS: Record<string, SettingOption> = {
	cleanup: { key: "cleanup", labelKey: "option.cleanup" },
	caption_reddit: { key: "captionReddit", labelKey: "option.captionReddit" },
	caption_soundcloud: {
		key: "captionSoundcloud",
		labelKey: "option.captionSoundcloud",
	},
	caption_instagram: {
		key: "captionInstagram",
		labelKey: "option.captionInstagram",
	},
	caption_tiktok: { key: "captionTiktok", labelKey: "option.captionTiktok" },
	caption_twitter: { key: "captionTwitter", labelKey: "option.captionTwitter" },
	caption_youtube: { key: "captionYoutube", labelKey: "option.captionYoutube" },
	caption_pinterest: {
		key: "captionPinterest",
		labelKey: "option.captionPinterest",
	},
	errors: { key: "errors", labelKey: "option.errors", adminOnly: true },
};

function isAdmin(userId: number | undefined) {
	return APP_ENV.ADMIN_ID !== undefined && String(userId) === APP_ENV.ADMIN_ID;
}

export const settingsController = new Composer<CustomContext>();
settingsController.command("settings", async (ctx) => {
	if (!ctx.message) {
		return;
	}

	if (!ctx.objects.chat) {
		await ctx.text("settingsGroupOnly");
		return;
	}

	const { settings } = ctx.objects.chat;
	const enabled = ctx.i18n.t("enabled");
	const disabled = ctx.i18n.t("disabled");
	const adminHint = ctx.i18n.t("adminOnly");
	const [option, value] = ctx.message.text.split(" ").slice(1) as [
		string?,
		string?,
	];

	if (!option || !value) {
		const lines = Object.entries(OPTIONS).map(([name, target]) => {
			const state = settings[target.key] ? enabled : disabled;
			const suffix = target.adminOnly ? ` · ${adminHint}` : "";
			return `${state} ${ctx.i18n.t(target.labelKey)} (<code>${name}</code>)${suffix}`;
		});
		await ctx.text("settings", { options: lines.join("\n") });
		return;
	}

	const target = OPTIONS[option];
	if (!target) {
		await ctx.text("unknownOption", { option });
		return;
	}

	if (target.adminOnly && !isAdmin(ctx.from?.id)) {
		await ctx.text("optionAdminOnly", { option: ctx.i18n.t(target.labelKey) });
		return;
	}

	const result = value === "yes" || value === "true";
	await setChatSetting({
		db: ctx.db,
		chatId: ctx.chat.id,
		key: target.key,
		value: result,
	});
	await ctx.text("settingsUpdated", {
		option: ctx.i18n.t(target.labelKey),
		value: result ? enabled : disabled,
	});
});
