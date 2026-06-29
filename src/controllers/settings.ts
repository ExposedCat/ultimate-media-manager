import { Composer } from "grammy";

import { APP_ENV } from "../config/env.ts";
import { setChatSetting, setUserSetting } from "../services/chat.ts";
import type { CustomContext } from "../types/context.ts";
import type { Settings } from "../types/database.ts";

type SettingOption = {
	key: keyof Settings;
	labelKey: string;
	commandId: string;
	adminOnly?: boolean;
};

const ENABLED_ICON = `<tg-emoji emoji-id="5825794181183836432">✔️</tg-emoji>`;
const DISABLED_ICON = `<tg-emoji emoji-id="5364330229043062830">➰</tg-emoji>`;
const SETTING_COMMAND_PATTERN = /^set_([a-z0-9]+)_(on|off)$/;

const OPTIONS: SettingOption[] = [
	{ key: "cleanup", labelKey: "option.cleanup", commandId: "clp" },
	{
		key: "captionReddit",
		labelKey: "option.captionReddit",
		commandId: "cpr",
	},
	{
		key: "captionSoundcloud",
		labelKey: "option.captionSoundcloud",
		commandId: "cpsc",
	},
	{
		key: "captionInstagram",
		labelKey: "option.captionInstagram",
		commandId: "cpig",
	},
	{
		key: "captionTiktok",
		labelKey: "option.captionTiktok",
		commandId: "cptt",
	},
	{
		key: "captionTwitter",
		labelKey: "option.captionTwitter",
		commandId: "cptw",
	},
	{
		key: "captionYoutube",
		labelKey: "option.captionYoutube",
		commandId: "cpyt",
	},
	{
		key: "captionPinterest",
		labelKey: "option.captionPinterest",
		commandId: "cppn",
	},
	{
		key: "errors",
		labelKey: "option.errors",
		commandId: "err",
		adminOnly: true,
	},
];

const OPTION_BY_COMMAND_ID = new Map(
	OPTIONS.map((option) => [option.commandId, option]),
);
const SETTING_COMMANDS = OPTIONS.flatMap((option) => [
	`set_${option.commandId}_on`,
	`set_${option.commandId}_off`,
]);
type SettingsTarget = {
	settings: Settings;
	replace: (settings: Settings) => void;
	set: (key: keyof Settings, value: boolean) => Promise<unknown>;
};

function isAdmin(userId: number | undefined) {
	return APP_ENV.ADMIN_ID !== undefined && String(userId) === APP_ENV.ADMIN_ID;
}

function getCommandName(text: string) {
	const [command] = text.split(/\s+/, 1);
	return command?.replace(/^\//, "").split("@")[0];
}

function parseSettingCommand(text: string) {
	const commandName = getCommandName(text);
	const match = commandName?.match(SETTING_COMMAND_PATTERN);
	if (!match) {
		return null;
	}

	const [, commandId, state] = match;
	const target = OPTION_BY_COMMAND_ID.get(commandId);
	if (!target) {
		return null;
	}

	return { target, value: state === "on" };
}

function renderSettingsOptions(ctx: CustomContext, settings: Settings): string {
	return OPTIONS.map((target) => {
		const enabled = settings[target.key];
		const icon = enabled ? ENABLED_ICON : DISABLED_ICON;
		const nextState = enabled ? "off" : "on";
		const suffix = target.adminOnly ? ` · ${ctx.i18n.t("adminOnly")}` : "";
		return `${icon} ${ctx.i18n.t(target.labelKey)} /set_${target.commandId}_${nextState}${suffix}`;
	}).join("\n");
}

async function replySettings(ctx: CustomContext, settings: Settings) {
	await ctx.text("settings", { options: renderSettingsOptions(ctx, settings) });
}

function getSettingsTarget(ctx: CustomContext): SettingsTarget | null {
	if (ctx.objects.chat && ctx.chat) {
		const chatId = ctx.chat.id;
		return {
			settings: ctx.objects.chat.settings,
			replace: (settings) => {
				if (ctx.objects.chat) {
					ctx.objects.chat.settings = settings;
				}
			},
			set: (key, value) =>
				setChatSetting({
					db: ctx.db,
					chatId,
					key,
					value,
				}),
		};
	}

	if (ctx.chat?.type === "private" && ctx.objects.user) {
		const userId = ctx.objects.user.userId;
		return {
			settings: ctx.objects.user.settings,
			replace: (settings) => {
				if (ctx.objects.user) {
					ctx.objects.user.settings = settings;
				}
			},
			set: (key, value) =>
				setUserSetting({
					db: ctx.db,
					userId,
					key,
					value,
				}),
		};
	}

	return null;
}

export const settingsController = new Composer<CustomContext>();
settingsController.command("settings", async (ctx) => {
	if (!ctx.message) {
		return;
	}

	const settingsTarget = getSettingsTarget(ctx);
	if (!settingsTarget) {
		await ctx.text("settingsGroupOnly");
		return;
	}

	await replySettings(ctx, settingsTarget.settings);
});

for (const command of SETTING_COMMANDS) {
	settingsController.command(command, async (ctx) => {
		if (!ctx.message) {
			return;
		}

		const settingsTarget = getSettingsTarget(ctx);
		if (!settingsTarget) {
			await ctx.text("settingsGroupOnly");
			return;
		}

		const parsed = parseSettingCommand(ctx.message.text);
		if (!parsed) {
			await replySettings(ctx, settingsTarget.settings);
			return;
		}

		const { target, value } = parsed;
		if (target.adminOnly && !isAdmin(ctx.from?.id)) {
			await ctx.text("optionAdminOnly", {
				option: ctx.i18n.t(target.labelKey),
			});
			return;
		}

		const settings = { ...settingsTarget.settings, [target.key]: value };
		settingsTarget.replace(settings);
		await settingsTarget.set(target.key, value);

		await replySettings(ctx, settings);
	});
}
