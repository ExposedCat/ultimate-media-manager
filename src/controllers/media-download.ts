import { Composer } from "grammy";
import { matchInput } from "../services/sources.js";
import type { CustomContext } from "../types/context.js";

export const mediaDownloadController = new Composer<CustomContext>();
mediaDownloadController.on(
	["message::url", "message::text_link"],
	async (ctx, next) => {
		const text = ctx.message.text;
		const entities = ctx.message.entities ?? ctx.message.caption_entities ?? [];

		if (ctx.message.forward_origin) {
			return;
		}

		const userName = [ctx.from.first_name, ctx.from.last_name]
			.filter(Boolean)
			.join(" ");

		const urls: string[] = [];

		for (const entity of entities) {
			if (entity.type === "url") {
				// biome-ignore lint/style/noNonNullAssertion: type url means text match, so text is defined
				urls.push(text!.slice(entity.offset, entity.length));
			} else if (entity.type === "text_link") {
				urls.push(entity.url);
			}
		}

		let shouldCleanup = false;
		let somethingSent = false;

		for (const url of urls) {
			const { adapter, type, proxyUrl, match } = matchInput(url);
			if (!adapter) continue;

			const result = await adapter(ctx, {
				source: { type, match },
				userId: ctx.from.id,
				userName,
				url,
				proxyUrl,
				replyId: ctx.message.reply_to_message?.message_id,
				threadId: ctx.message.is_topic_message
					? ctx.message.message_thread_id
					: undefined,
			});

			try {
				if (result.kind === "text") {
					await ctx.reply(result.caption, result.extra);
				} else {
					if (result.kind === "images") {
						await ctx.replyWithMediaGroup(
							result.files.map((file, index) => ({
								type: "photo",
								media: file,
								caption: index === 0 ? result.caption : undefined,
								...result.extra,
							})),
						);
					} else {
						const method =
							result.kind === "image" ? "replyWithPhoto" : "replyWithVideo";
						await ctx[method](result.file, {
							caption: result.caption,
							...result.extra,
						});
					}
				}
				somethingSent = true;
				if (!shouldCleanup && text === url) {
					shouldCleanup = true;
				}
			} catch (error) {
				console.error("[Failed to send media]", error);
			} finally {
				await result.cleanup();
			}
		}

		if (!somethingSent) {
			return await next();
		}

		if (shouldCleanup && ctx.objects.chat?.settings?.cleanup) {
			try {
				await ctx.deleteMessage();
			} catch {
				// ignore
			}
		}
	},
);
