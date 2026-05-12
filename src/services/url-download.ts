import type { CustomContext } from "../types/context.ts";
import { type InputMatcher, matchInput } from "./sources.ts";

type MessageEntityLike = {
	type: string;
	offset: number;
	length: number;
	url?: string;
};

type MessageLike = {
	text?: string;
	caption?: string;
	entities?: MessageEntityLike[];
	caption_entities?: MessageEntityLike[];
};

export function extractUrlsFromMessage(message?: MessageLike | null) {
	const text = message?.text ?? message?.caption ?? "";
	const entities = message?.entities ?? message?.caption_entities ?? [];
	const urls: string[] = [];

	for (const entity of entities) {
		if (entity.type === "url") {
			urls.push(text.slice(entity.offset, entity.offset + entity.length));
		} else if (entity.type === "text_link" && entity.url) {
			urls.push(entity.url);
		}
	}

	return urls;
}

async function reactWithEyes(ctx: CustomContext) {
	if (!ctx.chat || !ctx.message?.message_id) {
		return;
	}

	try {
		await ctx.api.setMessageReaction(ctx.chat.id, ctx.message.message_id, [
			{ type: "emoji", emoji: "👀" },
		]);
		console.info("[Reaction] Added eyes reaction", {
			chatId: ctx.chat.id,
			messageId: ctx.message.message_id,
		});
	} catch (error) {
		console.warn("[Reaction] Failed to add eyes reaction", {
			chatId: ctx.chat.id,
			messageId: ctx.message.message_id,
			error,
		});
	}
}

export async function downloadMatchedUrl(
	ctx: CustomContext,
	url: string,
	matcher: InputMatcher = matchInput,
) {
	if (!ctx.from) {
		return false;
	}

	const { adapter, type, proxyUrl, match } = matcher(url);
	if (!adapter || !type || !match) {
		console.info("[Download] No matcher found", {
			userId: ctx.from.id,
			url,
		});
		return false;
	}

	const userName = [ctx.from.first_name, ctx.from.last_name]
		.filter(Boolean)
		.join(" ");

	console.info("[Download] Matched URL", {
		userId: ctx.from.id,
		sourceType: type,
		url,
		proxyUrl,
	});

	try {
		await reactWithEyes(ctx);
		console.info("[Download] Starting adapter", {
			userId: ctx.from.id,
			sourceType: type,
			url,
		});

		const result = await adapter(ctx, {
			source: { type, match },
			userId: ctx.from.id,
			userName,
			url,
			proxyUrl,
			replyId: ctx.message?.reply_to_message?.message_id,
			threadId: ctx.message?.is_topic_message
				? ctx.message.message_thread_id
				: undefined,
		});

		try {
			console.info("[Download] Adapter returned result", {
				userId: ctx.from.id,
				sourceType: type,
				resultKind: result.kind,
				url,
			});
			if (result.kind === "text") {
				await ctx.reply(result.caption, result.extra);
			} else if (result.kind === "images") {
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
					result.kind === "image"
						? "replyWithPhoto"
						: result.kind === "audio"
							? "replyWithAudio"
							: "replyWithVideo";
				await ctx[method](result.file, {
					caption: result.caption,
					...result.extra,
				});
			}

			console.info("[Download] Sent result", {
				userId: ctx.from.id,
				sourceType: type,
				resultKind: result.kind,
				url,
			});
			return true;
		} catch (error) {
			console.error("[Failed to send media]", error);
			return false;
		} finally {
			console.info("[Download] Cleaning up resources", {
				userId: ctx.from.id,
				sourceType: type,
				url,
			});
			await result.cleanup();
		}
	} catch (error) {
		console.error("[Failed to download media]", {
			userId: ctx.from.id,
			sourceType: type,
			url,
			error,
		});
		return false;
	}
}
