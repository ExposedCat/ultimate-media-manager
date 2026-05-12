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
		return false;
	}

	const userName = [ctx.from.first_name, ctx.from.last_name]
		.filter(Boolean)
		.join(" ");

	try {
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

			return true;
		} catch (error) {
			console.error("[Failed to send media]", error);
			return false;
		} finally {
			await result.cleanup();
		}
	} catch (error) {
		console.error("[Failed to download media]", error);
		return false;
	}
}
