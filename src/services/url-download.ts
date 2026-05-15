import type { CustomContext } from "../types/context.ts";
import {
	buildDownloadResponse,
	buildLinkPreviewOptions,
} from "./download-response.ts";
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

function buildReplyExtra(ctx: CustomContext) {
	return {
		...(ctx.message?.is_topic_message && {
			message_thread_id: ctx.message.message_thread_id,
		}),
		...(ctx.message?.reply_to_message?.message_id && {
			reply_parameters: {
				message_id: ctx.message.reply_to_message.message_id,
				allow_sending_without_reply: true,
			},
		}),
	};
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

	const { type, fallbackUrl, match } = matcher(url);
	if (!type || !match) {
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
		fallbackUrl,
	});

	try {
		await reactWithEyes(ctx);
		console.info("[Download] Building response", {
			userId: ctx.from.id,
			sourceType: type,
			url,
		});

		const result = await buildDownloadResponse(ctx, {
			sourceType: type,
			userId: ctx.from.id,
			userName,
			url,
			fallbackUrl: fallbackUrl ?? undefined,
		});
		const replyExtra = buildReplyExtra(ctx);

		try {
			console.info("[Download] Built response", {
				userId: ctx.from.id,
				sourceType: type,
				mediaKind: result.media?.kind ?? "text",
				url,
			});

			if (!result.media) {
				await ctx.reply(result.text, {
					parse_mode: "HTML",
					...replyExtra,
					link_preview_options: buildLinkPreviewOptions(result.previewUrl),
				});
			} else if (result.media.kind === "images") {
				await ctx.replyWithMediaGroup(
					result.media.files.map((file, index) => ({
						type: "photo",
						media: file,
						caption: index === 0 ? result.text : undefined,
						parse_mode: index === 0 ? "HTML" : undefined,
					})),
					replyExtra,
				);
			} else {
				const method =
					result.media.kind === "image"
						? "replyWithPhoto"
						: result.media.kind === "audio"
							? "replyWithAudio"
							: "replyWithVideo";
				await ctx[method](result.media.file, {
					caption: result.text,
					parse_mode: "HTML",
					...replyExtra,
				});
			}

			console.info("[Download] Sent result", {
				userId: ctx.from.id,
				sourceType: type,
				mediaKind: result.media?.kind ?? "text",
				url,
			});
			return true;
		} catch (error) {
			console.error("[Failed to send media]", {
				userId: ctx.from.id,
				sourceType: type,
				mediaKind: result.media?.kind ?? "text",
				url,
				error,
			});

			if (result.media) {
				try {
					await ctx.reply(result.text, {
						parse_mode: "HTML",
						...replyExtra,
						link_preview_options: buildLinkPreviewOptions(result.previewUrl),
					});
					console.info(
						"[Download] Sent text fallback after media send failure",
						{
							userId: ctx.from.id,
							sourceType: type,
							url,
						},
					);
					return true;
				} catch (fallbackError) {
					console.error("[Download] Failed to send text fallback", {
						userId: ctx.from.id,
						sourceType: type,
						url,
						error: fallbackError,
					});
				}
			}

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
