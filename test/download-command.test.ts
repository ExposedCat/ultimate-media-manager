import { assertEquals } from "jsr:@std/assert@^1";
import { Api, Bot, Context } from "grammy";
import type { Message, MessageOrigin } from "grammy/types";

import { setupControllers } from "../src/config/bot.ts";
import {
	deleteCachedMedia,
	setCachedMedia,
} from "../src/services/media-file-cache.ts";
import type { CustomContext } from "../src/types/context.ts";

const botInfo = {
	id: 99,
	is_bot: true as const,
	first_name: "Bot",
	username: "download_test_bot",
	can_join_groups: true,
	can_read_all_group_messages: true,
	supports_inline_queries: false,
	can_connect_to_business: false,
	has_main_web_app: false,
	has_topics_enabled: false,
	allows_users_to_create_topics: false,
	can_manage_bots: false,
	supports_join_request_queries: false,
};

const origins: MessageOrigin[] = [
	{
		type: "channel",
		date: 0,
		chat: { id: -100, type: "channel", title: "Channel" },
		message_id: 1,
	},
	{
		type: "user",
		date: 0,
		sender_user: { id: 43, is_bot: true, first_name: "Source bot" },
	},
];

Deno.test("automatic YouTube video downloads use @vid attribution and normal cleanup", async () => {
	const url = "https://www.youtube.com/watch?v=abcdefghijk";
	const bot = new Bot<CustomContext>("test");
	setupControllers(bot);
	setCachedMedia(url, { kind: "video", fileId: "cached-video" });
	try {
		for (const { username, text, cleanup, failSend, expected } of [
			{
				username: "vid",
				text: url,
				cleanup: true,
				expected: ["setMessageReaction", "sendRichMessage", "deleteMessage"],
			},
			{
				username: "VID",
				text: url,
				cleanup: false,
				expected: ["setMessageReaction", "sendRichMessage"],
			},
			{
				username: "vid",
				text: `Watch this ${url}`,
				cleanup: true,
				expected: ["setMessageReaction", "sendRichMessage"],
			},
			{
				username: "vid",
				text: url,
				cleanup: true,
				failSend: true,
				expected: ["setMessageReaction", "sendRichMessage", "sendMessage"],
			},
			{ username: "other_bot", text: url, cleanup: true, expected: [] },
			{ username: undefined, text: `@vid ${url}`, cleanup: true, expected: [] },
		]) {
			const calls: string[] = [];
			const api = new Api("test", {
				fetch: async (input: URL | string) => {
					const method = String(input).split("/").pop() ?? "";
					calls.push(method);
					if (failSend && method === "sendRichMessage") {
						return Response.json({
							ok: false,
							error_code: 403,
							description: "Forbidden",
						});
					}
					return Response.json({ ok: true, result: true });
				},
			});
			const ctx = new Context(
				{
					update_id: 1,
					message: {
						message_id: 2,
						date: 0,
						chat: { id: -42, type: "group", title: "Group" },
						from: { id: 42, is_bot: false, first_name: "User" },
						via_bot: username
							? { id: 43, first_name: "Inline bot", is_bot: true, username }
							: undefined,
						text,
						entities: [
							{ type: "url", offset: text.indexOf(url), length: url.length },
						],
					},
				},
				api,
				botInfo,
			) as CustomContext;
			Object.assign(ctx, {
				i18n: { t: (key: string) => key },
				telemetry: { event() {} },
				objects: { chat: { settings: { cleanup } } },
			});
			await bot.middleware()(ctx, () => Promise.resolve());
			assertEquals(calls, expected);
		}
	} finally {
		deleteCachedMedia(url);
	}
});

for (const origin of origins) {
	for (const reply of [false, true]) {
		Deno.test(`/download handles ${origin.type} forwards ${reply ? "in replies" : "directly"}`, async () => {
			const url = `https://x.com/example/status/download-${origin.type}-${reply}`;
			const command = "/download@download_test_bot";
			const source = {
				message_id: 1,
				date: 0,
				chat: { id: -42, type: "supergroup", title: "Group" },
				from: { id: 43, is_bot: true, first_name: "Source bot" },
				forward_origin: origin,
				reply_to_message: undefined,
				text: url,
				entities: [{ type: "url", offset: 0, length: url.length }],
			} satisfies Message.TextMessage;
			const ctx = new Context(
				{
					update_id: 1,
					message: {
						...source,
						message_id: 2,
						...(reply && {
							from: { id: 42, is_bot: false, first_name: "User" },
							forward_origin: undefined,
							reply_to_message: source,
						}),
						text: reply ? command : `${command} ${url}`,
						entities: [
							{ type: "bot_command", offset: 0, length: command.length },
							...(!reply
								? [
										{
											type: "url" as const,
											offset: command.length + 1,
											length: url.length,
										},
									]
								: []),
						],
					},
				},
				new Api("test"),
				botInfo,
			) as CustomContext;
			const messages: unknown[] = [];
			Object.assign(ctx, {
				i18n: { t: (key: string) => key },
				telemetry: { event() {} },
				replyWithRichMessage: (message: unknown) => {
					messages.push(message);
					return Promise.resolve({});
				},
			});
			ctx.api.setMessageReaction = () => Promise.resolve(true);
			const bot = new Bot<CustomContext>("test");
			setupControllers(bot);
			let fallthrough = false;
			setCachedMedia(url, { kind: "image", fileId: "cached-photo" });
			try {
				await bot.middleware()(ctx, () => {
					fallthrough = true;
					return Promise.resolve();
				});
				assertEquals(messages.length, 1);
				assertEquals(fallthrough, false);
			} finally {
				deleteCachedMedia(url);
			}
		});
	}
}
