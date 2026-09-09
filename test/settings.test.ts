import {
	assertEquals,
	assertRejects,
	assertStringIncludes,
} from "jsr:@std/assert@^1";
import { Api, Context } from "grammy";
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
			t: (key: string, values?: { seconds?: number }) =>
				values?.seconds !== undefined ? `${key} ${values.seconds}s` : key,
		},
	});
	ctx.text = ((key: string, values?: { options?: string }) => {
		replies.push({ key, options: values?.options ?? "" });
		return Promise.resolve(ctx.message);
	}) as CustomContext["text"];
	return { ctx, writes, replies };
}

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
				`/set_sld_${expected ? "off" : "on"}`,
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
