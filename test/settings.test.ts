import {
	assertEquals,
	assertRejects,
	assertStringIncludes,
} from "jsr:@std/assert@^1";
import { Api, Context } from "grammy";
import type { InputRichMessage } from "grammy/types";
import { APP_ENV } from "../src/config/env.ts";
import { settingsController } from "../src/controllers/settings.ts";
import {
	DEFAULT_SETTINGS,
	getOrCreateChat,
	getUserSettings,
} from "../src/services/chat.ts";
import {
	responseSlideshowDelay,
	slideshowDelay,
} from "../src/services/slideshow.ts";
import type { CustomContext } from "../src/types/context.ts";
import type { Database, Settings } from "../src/types/database.ts";

function settingsContext(
	command: string,
	scope: "private" | "group" = "private",
	failWrite = false,
) {
	const writes: { collection: string; filter: unknown; update: unknown }[] = [];
	const replies: { key: string; options: string }[] = [];
	const updateOne =
		(collection: string) => (filter: unknown, update: unknown) => {
			if (failWrite) throw new Error("database unavailable");
			writes.push({ collection, filter, update });
			return Promise.resolve({ acknowledged: true, matchedCount: 1 });
		};
	const db = {
		chat: { updateOne: updateOne("chat") },
		userSettings: { updateOne: updateOne("user") },
	} as unknown as Database;
	const ctx = new Context(
		{
			update_id: 1,
			message: {
				message_id: 1,
				date: 0,
				chat:
					scope === "private"
						? { id: 42, type: "private", first_name: "User" }
						: { id: -42, type: "group", title: "Group" },
				from: { id: 42, is_bot: false, first_name: "User" },
				text: command,
				entities: [{ type: "bot_command", offset: 0, length: command.length }],
			},
		},
		new Api("test"),
		{
			id: 99,
			is_bot: true,
			first_name: "Bot",
			username: "slider_test_bot",
			can_join_groups: true,
			can_read_all_group_messages: true,
			supports_inline_queries: false,
			can_connect_to_business: false,
			has_main_web_app: false,
			has_topics_enabled: false,
			allows_users_to_create_topics: false,
			can_manage_bots: false,
			supports_join_request_queries: false,
		},
	) as CustomContext;
	ctx.db = db;
	ctx.objects = {
		chat:
			scope === "group"
				? {
						chatId: -42,
						title: "Group",
						settings: { ...DEFAULT_SETTINGS, slideshowDelay: 5 },
					}
				: null,
		user:
			scope === "private"
				? { userId: 42, settings: { ...DEFAULT_SETTINGS, slideshowDelay: 5 } }
				: null,
		guestReceiverUser: null,
		guestSenderUser: null,
	};
	Object.assign(ctx, {
		i18n: {
			t: (key: string, values?: { seconds?: number; options?: string }) => {
				if (key === "settings")
					return `<h2>Chat settings</h2>${values?.options}`;
				if (key === "enabled") return "Enabled";
				if (key === "disabled") return "Disabled";
				return values?.seconds !== undefined
					? `${key} ${values.seconds}s`
					: key;
			},
		},
	});
	ctx.text = ((key: string, values?: { options?: string }) => {
		replies.push({ key, options: values?.options ?? "" });
		return Promise.resolve(ctx.message);
	}) as CustomContext["text"];
	ctx.replyWithRichMessage = ((message: InputRichMessage) => {
		replies.push({ key: "settings", options: message.html ?? "" });
		return Promise.resolve(ctx.message);
	}) as CustomContext["replyWithRichMessage"];
	return { ctx, writes, replies };
}

function callbackContext(
	data: string,
	scope: "private" | "group" = "private",
	failWrite = false,
) {
	const base = settingsContext("/settings", scope, failWrite);
	const message = base.ctx.message;
	if (!message) throw new Error("Missing test message");
	const ctx = new Context(
		{
			update_id: 2,
			callback_query: {
				id: "settings-click",
				chat_instance: "test",
				data,
				from: { id: 42, is_bot: false, first_name: "User" },
				message: { ...message, from: base.ctx.me },
			},
		},
		base.ctx.api,
		base.ctx.me,
	) as CustomContext;
	Object.assign(ctx, {
		db: base.ctx.db,
		objects: base.ctx.objects,
		i18n: base.ctx.i18n,
		text: base.ctx.text,
		replyWithRichMessage: base.ctx.replyWithRichMessage,
	});
	const edits: InputRichMessage[] = [];
	const answers: unknown[] = [];
	ctx.editMessageText = async (message) => {
		if (typeof message === "string") throw new Error("Expected rich settings");
		edits.push(message);
		return true;
	};
	ctx.answerCallbackQuery = async (answer) => {
		answers.push(answer);
		return true;
	};
	return { ...base, ctx, edits, answers };
}

Deno.test("settings show status buttons and delay choices without command links", async () => {
	const { ctx, replies } = settingsContext("/settings");
	await settingsController.middleware()(ctx, () => Promise.resolve());
	const html = replies[0].options;
	assertEquals(html.includes("/set_"), false);
	assertEquals((html.match(/data="settings:toggle:/g) ?? []).length, 10);
	assertStringIncludes(
		html,
		'<p>option.cleanup <tg-button type="callback_data" style="success" data="settings:toggle:clp">Enabled</tg-button></p>',
	);
	assertStringIncludes(
		html,
		'style="danger" data="settings:toggle:err">Disabled</tg-button>',
	);
	assertStringIncludes(
		html,
		'style="primary" data="settings:delay:5">5s</tg-button>',
	);
	assertEquals((html.match(/<tg-button-row>/g) ?? []).length, 2);
	assertStringIncludes(
		html,
		'<p>option.slideshow 5s <tg-button type="callback_data" style="success" data="settings:toggle:sld">Enabled</tg-button></p>',
	);
	for (let seconds = 1; seconds <= 10; seconds++)
		assertStringIncludes(
			html,
			`data="settings:delay:${seconds}">${seconds}s</tg-button>`,
		);
});

Deno.test("status clicks persist each boolean setting and update the original message in both directions", async () => {
	for (const scope of ["private", "group"] as const) {
		for (const [id, key] of [
			["clp", "cleanup"],
			["cpr", "captionReddit"],
			["cpsc", "captionSoundcloud"],
			["cpig", "captionInstagram"],
			["cptt", "captionTiktok"],
			["cptw", "captionTwitter"],
			["cpyt", "captionYoutube"],
			["cppn", "captionPinterest"],
		]) {
			const { ctx, writes, replies, edits, answers } = callbackContext(
				`settings:toggle:${id}`,
				scope,
			);
			for (const enabled of [false, true]) {
				await settingsController.middleware()(ctx, () => Promise.resolve());
				assertEquals(writes.at(-1), {
					collection: scope === "private" ? "user" : "chat",
					filter: scope === "private" ? { userId: 42 } : { chatId: -42 },
					update: { $set: { [`settings.${key}`]: enabled } },
				});
				assertStringIncludes(
					edits.at(-1)?.html ?? "",
					`style="${enabled ? "success" : "danger"}" data="settings:toggle:${id}">${enabled ? "Enabled" : "Disabled"}`,
				);
			}
			assertEquals(answers.length, 2);
			assertEquals(replies, []);
		}
	}
});

Deno.test("slideshow clicks toggle off/default on and select any valid delay", async () => {
	const toggle = callbackContext("settings:toggle:sld");
	for (const expected of [0, 1]) {
		await settingsController.middleware()(toggle.ctx, () => Promise.resolve());
		assertEquals(responseSlideshowDelay(toggle.ctx), expected);
		assertEquals(toggle.writes.at(-1)?.update, {
			$set: { "settings.slideshowDelay": expected },
		});
	}
	for (let seconds = 0; seconds <= 10; seconds++) {
		const { ctx, edits, answers } = callbackContext(
			`settings:delay:${seconds}`,
			"group",
		);
		await settingsController.middleware()(ctx, () => Promise.resolve());
		assertEquals(responseSlideshowDelay(ctx), seconds);
		assertStringIncludes(
			edits[0].html ?? "",
			`style="${seconds ? "success" : "danger"}" data="settings:toggle:sld">${seconds ? "Enabled" : "Disabled"}`,
		);
		assertEquals(answers.length, 1);
	}
});

Deno.test("admin-only settings check the clicking user", async () => {
	const originalAdmin = APP_ENV.ADMIN_ID;
	try {
		APP_ENV.ADMIN_ID = "7";
		const denied = callbackContext("settings:toggle:err", "group");
		await settingsController.middleware()(denied.ctx, () => Promise.resolve());
		assertEquals(denied.writes, []);
		assertEquals(denied.edits, []);
		assertEquals(denied.answers, [
			{ text: "optionAdminOnly", show_alert: true },
		]);
		APP_ENV.ADMIN_ID = "42";
		const allowed = callbackContext("settings:toggle:err", "group");
		await settingsController.middleware()(allowed.ctx, () => Promise.resolve());
		assertEquals(allowed.writes[0].update, {
			$set: { "settings.errors": true },
		});
	} finally {
		APP_ENV.ADMIN_ID = originalAdmin;
	}
});

Deno.test("malformed callback values are acknowledged without changing settings", async () => {
	for (const data of [
		"settings:toggle:missing",
		"settings:delay:11",
		"settings:delay:-1",
		"settings:delay:1.5",
		"settings:delay:01",
		"settings:toggle:clp:extra",
	]) {
		const { ctx, writes, edits, answers } = callbackContext(data);
		await settingsController.middleware()(ctx, () => Promise.resolve());
		assertEquals(writes, []);
		assertEquals(edits, []);
		assertEquals(answers, [
			{ text: "settingsInvalidButton", show_alert: true },
		]);
	}
});

Deno.test("callback failures distinguish unsaved settings from failed message refreshes", async () => {
	const failedSave = callbackContext("settings:toggle:sld", "private", true);
	await settingsController.middleware()(failedSave.ctx, () =>
		Promise.resolve(),
	);
	assertEquals(responseSlideshowDelay(failedSave.ctx), 5);
	assertEquals(failedSave.edits, []);
	assertEquals(failedSave.answers, [
		{ text: "settingsUpdateFailed", show_alert: true },
	]);
	const failedEdit = callbackContext("settings:toggle:sld");
	failedEdit.ctx.editMessageText = () =>
		Promise.reject(new Error("message deleted"));
	await settingsController.middleware()(failedEdit.ctx, () =>
		Promise.resolve(),
	);
	assertEquals(responseSlideshowDelay(failedEdit.ctx), 0);
	assertEquals(failedEdit.answers, [
		{ text: "settingsRefreshFailed", show_alert: true },
	]);
});

Deno.test("selecting the current delay acknowledges Telegram's unchanged-message response", async () => {
	const { ctx, writes, answers } = callbackContext("settings:delay:5");
	ctx.editMessageText = () =>
		Promise.reject(new Error("Bad Request: message is not modified"));
	await settingsController.middleware()(ctx, () => Promise.resolve());
	assertEquals(writes, []);
	assertEquals(answers, [undefined]);
});

Deno.test("slideshow commands persist on/off and every allowed delay in groups and private chats", async () => {
	for (const scope of ["private", "group"] as const) {
		for (const [command, expected] of [
			["on", 1],
			["off", 0],
			...Array.from(
				{ length: 11 },
				(_, value) => [String(value), value] as const,
			),
		] as const) {
			const { ctx, writes, replies } = settingsContext(
				`/set_sld_${command}@slider_test_bot`,
				scope,
			);
			await settingsController.middleware()(ctx, () => {
				throw new Error("command not handled");
			});
			assertEquals(writes, [
				{
					collection: scope === "private" ? "user" : "chat",
					filter: scope === "private" ? { userId: 42 } : { chatId: -42 },
					update: { $set: { "settings.slideshowDelay": expected } },
				},
			]);
			assertEquals(responseSlideshowDelay(ctx), expected);
			assertStringIncludes(
				replies[0].options,
				`style="${expected ? "success" : "danger"}" data="settings:toggle:sld">${expected ? "Enabled" : "Disabled"}`,
			);
			assertStringIncludes(replies[0].options, `${expected}s`);
		}
	}
});

Deno.test("invalid slideshow commands do not modify settings", async () => {
	for (const value of ["11", "-1", "1.5", "01", "yes"]) {
		const { ctx, writes, replies } = settingsContext(`/set_sld_${value}`);
		let passed = false;
		await settingsController.middleware()(ctx, () => {
			passed = true;
			return Promise.resolve();
		});
		assertEquals(passed, true);
		assertEquals(writes, []);
		assertEquals(replies, []);
	}
});

Deno.test("failed setting writes do not change the active setting or report success", async () => {
	const { ctx, replies } = settingsContext("/set_sld_off", "group", true);
	await assertRejects(
		async () =>
			await settingsController.middleware()(ctx, () => Promise.resolve()),
		Error,
		"database unavailable",
	);
	assertEquals(responseSlideshowDelay(ctx), 5);
	assertEquals(replies, []);
});

Deno.test("existing boolean settings still work", async () => {
	const { ctx, writes } = settingsContext("/set_clp_off");
	await settingsController.middleware()(ctx, () => Promise.resolve());
	assertEquals(writes[0].update, { $set: { "settings.cleanup": false } });
	assertEquals(ctx.objects.user?.settings.cleanup, false);
});

Deno.test("old stored settings inherit the slideshow default without losing preferences", async () => {
	const oldSettings = { cleanup: false, errors: true };
	const db = {
		chat: {
			findOneAndUpdate: () =>
				Promise.resolve({
					ok: 1,
					value: { chatId: -42, title: "Old", settings: oldSettings },
				}),
		},
		userSettings: {
			findOne: () => Promise.resolve({ userId: 42, settings: oldSettings }),
		},
	} as unknown as Database;
	const chat = await getOrCreateChat({ db, chatId: -42, title: "Old" });
	const user = await getUserSettings({ db, userId: 42 });
	assertEquals(chat.settings, { ...DEFAULT_SETTINGS, ...oldSettings });
	assertEquals(user?.settings, { ...DEFAULT_SETTINGS, ...oldSettings });
	assertEquals(slideshowDelay({}), 1);
	for (const value of [-1, 11, 1.5, Number.NaN])
		assertEquals(slideshowDelay({ slideshowDelay: value }), 1);
});

Deno.test("guest slideshow settings prefer the receiver, then the sender, then the default", () => {
	const ctx = {
		guestMessage: {},
		chat: { type: "private" },
		objects: {
			guestReceiverUser: {
				settings: { ...DEFAULT_SETTINGS, slideshowDelay: 0 },
			},
			guestSenderUser: { settings: { ...DEFAULT_SETTINGS, slideshowDelay: 8 } },
		},
	} as unknown as CustomContext;
	assertEquals(responseSlideshowDelay(ctx), 0);
	ctx.objects.guestReceiverUser = null;
	assertEquals(responseSlideshowDelay(ctx), 8);
	ctx.objects.guestSenderUser = null;
	assertEquals(responseSlideshowDelay(ctx), 1);
});
