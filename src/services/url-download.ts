import type { CustomContext } from "../types/context.ts";
import { type MessageLike, extractUrlsFromMessage } from "./context-message.ts";
import {
	type DownloadResponse,
	buildDownloadResponse,
	buildLinkPreviewOptions,
} from "./download-response.ts";
import { type InputMatcher, matchInput } from "./sources.ts";

const GUEST_VIDEO_THUMBNAIL_URL =
	"https://external-content.duckduckgo.com/iu/?u=https%3A%2F%2Fcdn4.iconfinder.com%2Fdata%2Ficons%2Farrows-245%2F24%2Fdownload_1-1024.png&f=1&nofb=1&ipt=fe03aaef09431f64f583d6239a6a6423af9fd2375434e98f80eff03b0119a485";

function buildReplyExtra(ctx: CustomContext) {
	const message = ctx.msg as
		| (MessageLike & {
				is_topic_message?: boolean;
				message_thread_id?: number;
				reply_to_message?: { message_id?: number } | null;
		  })
		| null;

	return {
		...(message?.is_topic_message && {
			message_thread_id: message.message_thread_id,
		}),
		...(message?.reply_to_message?.message_id && {
			reply_parameters: {
				message_id: message.reply_to_message.message_id,
				allow_sending_without_reply: true,
			},
		}),
	};
}

async function reactWithEyes(ctx: CustomContext) {
	if (!ctx.chat || !ctx.msg?.message_id || ctx.guestMessage) {
		return;
	}

	try {
		await ctx.api.setMessageReaction(ctx.chat.id, ctx.msg.message_id, [
			{ type: "emoji", emoji: "👀" },
		]);
		console.info("[Reaction] Added eyes reaction", {
			chatId: ctx.chat.id,
			messageId: ctx.msg.message_id,
		});
	} catch (error) {
		console.warn("[Reaction] Failed to add eyes reaction", {
			chatId: ctx.chat.id,
			messageId: ctx.msg.message_id,
			error,
		});
	}
}

type GuestQueryResult = Parameters<CustomContext["answerGuestQuery"]>[0];
type CaptionAuthor = {
	userId: number;
	userName: string;
};

function stripHtml(text: string) {
	return text.replace(/<[^>]+>/g, "").trim();
}

function buildGuestArticleResult(result: DownloadResponse): GuestQueryResult {
	const plainText = stripHtml(result.text);

	return {
		type: "article",
		id: crypto.randomUUID(),
		title: plainText.slice(0, 64) || "Download result",
		description: plainText.slice(0, 128) || undefined,
		url: result.previewUrl,
		input_message_content: {
			message_text: result.text,
			parse_mode: "HTML",
			link_preview_options: buildLinkPreviewOptions(result.previewUrl),
		},
	};
}

function buildGuestMediaQueryResult(
	result: DownloadResponse,
): GuestQueryResult {
	const plainText = stripHtml(result.text);
	const title = plainText.slice(0, 64) || "Download result";
	const media = result.media;
	if (!media) {
		return buildGuestArticleResult(result);
	}

	if (media.kind === "images") {
		const photoUrl = media.publicUrls?.[0];
		if (!photoUrl) {
			return buildGuestArticleResult(result);
		}

		return {
			type: "photo",
			id: crypto.randomUUID(),
			photo_url: photoUrl,
			thumbnail_url: photoUrl,
			title,
			description: plainText.slice(0, 128) || undefined,
			caption: result.text,
			parse_mode: "HTML",
		};
	}

	if (!media.publicUrl) {
		return buildGuestArticleResult(result);
	}

	if (media.kind === "image") {
		return {
			type: "photo",
			id: crypto.randomUUID(),
			photo_url: media.publicUrl,
			thumbnail_url: media.publicUrl,
			title,
			description: plainText.slice(0, 128) || undefined,
			caption: result.text,
			parse_mode: "HTML",
		};
	}

	if (media.kind === "audio") {
		return {
			type: "audio",
			id: crypto.randomUUID(),
			audio_url: media.publicUrl,
			title,
			caption: result.text,
			parse_mode: "HTML",
		};
	}

	return {
		type: "video",
		id: crypto.randomUUID(),
		video_url: media.publicUrl,
		mime_type: "video/mp4",
		thumbnail_url: GUEST_VIDEO_THUMBNAIL_URL,
		title,
		caption: result.text,
		parse_mode: "HTML",
	};
}

async function buildGuestQueryResult(
	ctx: CustomContext,
	result: DownloadResponse,
): Promise<GuestQueryResult> {
	const plainText = stripHtml(result.text);

	if (!result.media) {
		console.info("[GuestQuery] Using article result for text-only response", {
			previewUrl: result.previewUrl,
		});
		return buildGuestArticleResult(result);
	}

	console.info("[GuestQuery] Building direct guest media result", {
		kind: result.media.kind,
		previewUrl: result.previewUrl,
		hasPublicUrl:
			result.media.kind === "images"
				? Boolean(result.media.publicUrls?.[0])
				: "publicUrl" in result.media
					? Boolean(result.media.publicUrl)
					: false,
	});
	return buildGuestMediaQueryResult(result);
}

function getCaptionAuthor(ctx: CustomContext): CaptionAuthor | null {
	const repliedUser = (
		ctx.msg?.reply_to_message as
			| {
					from?: {
						id: number;
						first_name: string;
						last_name?: string;
					};
			  }
			| undefined
	)?.from;

	if (repliedUser) {
		return {
			userId: repliedUser.id,
			userName: [repliedUser.first_name, repliedUser.last_name]
				.filter(Boolean)
				.join(" "),
		};
	}

	if (!ctx.from) {
		return null;
	}

	return {
		userId: ctx.from.id,
		userName: [ctx.from.first_name, ctx.from.last_name]
			.filter(Boolean)
			.join(" "),
	};
}

export async function downloadMatchedUrl(
	ctx: CustomContext,
	url: string,
	matcher: InputMatcher = matchInput,
) {
	const captionAuthor = getCaptionAuthor(ctx);
	if (!ctx.from || !captionAuthor) {
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

	console.info("[Download] Matched URL", {
		userId: ctx.from.id,
		captionUserId: captionAuthor.userId,
		captionUserName: captionAuthor.userName,
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
			userId: captionAuthor.userId,
			userName: captionAuthor.userName,
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

			if (ctx.guestMessage) {
				await ctx.answerGuestQuery(await buildGuestQueryResult(ctx, result));
			} else if (!result.media) {
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
