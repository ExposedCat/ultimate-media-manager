import { Composer } from "grammy";
import type { InputRichMessage } from "grammy/types";

import { APP_ENV } from "../config/env.ts";
import { escapeHtml } from "../helpers/html.ts";
import { setChatSetting, setUserSetting } from "../services/chat.ts";
import { slideshowDelay } from "../services/slideshow.ts";
import type { CustomContext } from "../types/context.ts";
import type { Settings } from "../types/database.ts";

type SettingOption = {
	key: Exclude<keyof Settings, "slideshowDelay">;
	labelKey: string;
	commandId: string;
	adminOnly?: boolean;
};

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
	set: <K extends keyof Settings>(
		key: K,
		value: Settings[K],
	) => Promise<unknown>;
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
	const options = OPTIONS.map((target) => {
		const enabled = settings[target.key];
		const suffix = target.adminOnly ? ` · ${ctx.i18n.t("adminOnly")}` : "";
		return `<p>${escapeHtml(ctx.i18n.t(target.labelKey) + suffix)} ${toggleButton(ctx, target.commandId, enabled)}</p>`;
	}).join("\n");
	const delay = slideshowDelay(settings);
	const slider = `<p>${escapeHtml(ctx.i18n.t("option.slideshow", { seconds: delay }))} ${toggleButton(ctx, "sld", delay > 0)}</p>`;
	const delays = [1, 6]
		.map((start) => {
			const buttons = Array.from({ length: 5 }, (_, index) => {
				const seconds = start + index;
				return `<tg-button type="callback_data"${seconds === delay ? ' style="primary"' : ""} data="settings:delay:${seconds}">${seconds}s</tg-button>`;
			}).join("");
			return `<tg-button-row>${buttons}</tg-button-row>`;
		})
		.join("\n");
	return `${options}\n${slider}\n<p>${escapeHtml(ctx.i18n.t("slideshowDelayHelp"))}</p>${delays}`;
}

function toggleButton(
	ctx: CustomContext,
	commandId: string,
	enabled: boolean,
): string {
	return `<tg-button type="callback_data" style="${enabled ? "success" : "danger"}" data="settings:toggle:${commandId}">${escapeHtml(ctx.i18n.t(enabled ? "enabled" : "disabled"))}</tg-button>`;
}

function settingsMessage(
	ctx: CustomContext,
	settings: Settings,
): InputRichMessage {
	return {
		html: ctx.i18n.t("settings", {
			options: renderSettingsOptions(ctx, settings),
		}),
		skip_entity_detection: true,
	};
}

async function replySettings(ctx: CustomContext, settings: Settings) {
	await ctx.replyWithRichMessage(settingsMessage(ctx, settings));
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

settingsController.callbackQuery(/^settings:/, async (ctx) => {
	const target = getSettingsTarget(ctx);
	if (!ctx.callbackQuery.message || !target) {
		await ctx.answerCallbackQuery({
			text: ctx.i18n.t("settingsGroupOnly"),
			show_alert: true,
		});
		return;
	}
	const data = ctx.callbackQuery.data;
	const toggle = data.match(/^settings:toggle:([a-z0-9]+)$/);
	const delay = data.match(/^settings:delay:(10|[0-9])$/);
	const option = toggle ? OPTION_BY_COMMAND_ID.get(toggle[1]) : undefined;
	let key: keyof Settings;
	let value: boolean | number;
	if (toggle?.[1] === "sld") {
		key = "slideshowDelay";
		value = slideshowDelay(target.settings) > 0 ? 0 : 1;
	} else if (option) {
		if (option.adminOnly && !isAdmin(ctx.from.id)) {
			await ctx.answerCallbackQuery({
				text: ctx.i18n.t("optionAdminOnly", {
					option: ctx.i18n.t(option.labelKey),
				}),
				show_alert: true,
			});
			return;
		}
		key = option.key;
		value = !target.settings[key];
	} else if (delay) {
		key = "slideshowDelay";
		value = Number(delay[1]);
	} else {
		await ctx.answerCallbackQuery({
			text: ctx.i18n.t("settingsInvalidButton"),
			show_alert: true,
		});
		return;
	}

	let saved = false;
	try {
		const settings = { ...target.settings, [key]: value };
		if (target.settings[key] !== value) {
			await target.set(key, value);
			target.replace(settings);
		}
		saved = true;
		try {
			await ctx.editMessageText(settingsMessage(ctx, settings));
		} catch (error) {
			// Selecting an already-active delay needs only a callback acknowledgement.
			if (
				!(
					error instanceof Error &&
					error.message.includes("message is not modified")
				)
			)
				throw error;
		}
	} catch (error) {
		console.warn("[Settings] Button update failed", { key, saved, error });
		await ctx.answerCallbackQuery({
			text: ctx.i18n.t(
				saved ? "settingsRefreshFailed" : "settingsUpdateFailed",
			),
			show_alert: true,
		});
		return;
	}
	await ctx.answerCallbackQuery();
});

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
		await settingsTarget.set(target.key, value);
		settingsTarget.replace(settings);

		await replySettings(ctx, settings);
	});
}

for (const value of [
	"on",
	"off",
	...Array.from({ length: 11 }, (_, n) => String(n)),
]) {
	settingsController.command(`set_sld_${value}`, async (ctx) => {
		const target = getSettingsTarget(ctx);
		if (!target) {
			await ctx.text("settingsGroupOnly");
			return;
		}
		const delay = value === "on" ? 1 : value === "off" ? 0 : Number(value);
		const settings = { ...target.settings, slideshowDelay: delay };
		await target.set("slideshowDelay", delay);
		target.replace(settings);
		await replySettings(ctx, settings);
	});
}
