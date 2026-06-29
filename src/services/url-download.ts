import { InputFile } from "grammy";
import type { InputMediaPhoto, InputMediaVideo } from "grammy/types";

import { escapeHtml } from "../helpers/html.ts";
import type { CustomContext } from "../types/context.ts";
import {
	type CachedMedia as CachedChatMedia,
	cacheDownloadedMedia,
} from "./cache-media.ts";
import { createImageCollage } from "./collage.ts";
import { type MessageLike, extractUrlsFromMessage } from "./context-message.ts";
import { materializeImageFiles } from "./download-media.ts";
import {
	type DownloadResponse,
	buildDownloadResponse,
	buildDownloadResponseText,
	buildLinkPreviewOptions,
} from "./download-response.ts";
import {
	type CachedMedia,
	deleteCachedMedia,
	getCachedMedia,
	getCachedMediaFromMediaGroup,
	getCachedMediaFromSingleMessage,
	setCachedMedia,
} from "./media-file-cache.ts";
import { type InputMatcher, matchInput } from "./sources.ts";

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

async function replyWithCachedMedia(
	ctx: CustomContext,
	media: CachedMedia,
	text: string,
	replyExtra: ReturnType<typeof buildReplyExtra>,
) {
	if (media.kind === "images") {
		await replyWithMediaItems(
			ctx,
			media.items.map((item) => ({ kind: item.kind, media: item.fileId })),
			text,
			replyExtra,
		);
		return;
	}

	const method = getReplyMethod(media.kind);

	await ctx[method](media.fileId, {
		caption: text,
		parse_mode: "HTML",
		...replyExtra,
	});
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

type GuestMediaMetadata = {
	description?: string;
	plainText: string;
	title: string;
};

type MessageAuthor = {
	id: number;
	first_name: string;
	last_name?: string;
};

type MessageWithAuthor = MessageLike & {
	from?: MessageAuthor;
};

type SingleMediaKind = Extract<
	CachedMedia["kind"],
	"image" | "audio" | "video"
>;
type MediaGroupKind = Extract<CachedMedia["kind"], "image" | "video">;
type SendableMediaGroupItem = {
	kind: MediaGroupKind;
	media: string | InputFile;
};

const MAX_MEDIA_GROUP_SIZE = 10;

function stripHtml(text: string) {
	return text.replace(/<[^>]+>/g, "").trim();
}

async function replyWithPreviewFallback(
	ctx: CustomContext,
	result: DownloadResponse,
	replyExtra: ReturnType<typeof buildReplyExtra>,
) {
	try {
		await ctx.reply(result.text, {
			parse_mode: "HTML",
			...replyExtra,
			link_preview_options: buildLinkPreviewOptions(result.previewUrl),
		});
		return true;
	} catch (htmlError) {
		console.warn("[Download] Preview fallback failed", {
			userId: ctx.from?.id,
			error: htmlError,
		});
	}

	await ctx.reply(stripHtml(result.text), {
		...replyExtra,
		link_preview_options: buildLinkPreviewOptions(result.previewUrl),
	});
	return true;
}

async function replyWithError(
	ctx: CustomContext,
	result: DownloadResponse,
	replyExtra: ReturnType<typeof buildReplyExtra>,
) {
	const text = ctx.i18n.t("error.report", {
		viewOn: result.text,
		error: escapeHtml(result.error ?? "unknown error"),
	});
	await ctx.reply(text, {
		parse_mode: "HTML",
		...replyExtra,
		link_preview_options: buildLinkPreviewOptions(result.previewUrl),
	});
}

// Causes worth telling any user about (not a bug — a limitation of the post),
// shown regardless of the admin-only error toggle.
const USER_FACING_REASONS = new Set([
	"ageRestricted",
	"private",
	"loginRequired",
	"deleted",
	"notFound",
]);

async function replyWithReason(
	ctx: CustomContext,
	result: DownloadResponse,
	replyExtra: ReturnType<typeof buildReplyExtra>,
) {
	const text = ctx.i18n.t("reasonNotice", {
		viewOn: result.text,
		reason: ctx.i18n.t(`reason.${result.reason}`),
	});
	await ctx.reply(text, {
		parse_mode: "HTML",
		...replyExtra,
		link_preview_options: buildLinkPreviewOptions(result.previewUrl),
	});
}

// A text post (no media): the caption already holds title/body, so send it as a
// plain message with the link preview off — the preview would just be noise.
async function replyWithText(
	ctx: CustomContext,
	result: DownloadResponse,
	replyExtra: ReturnType<typeof buildReplyExtra>,
) {
	await ctx.reply(result.text, {
		parse_mode: "HTML",
		...replyExtra,
		link_preview_options: { is_disabled: true },
	});
}

function buildGuestMediaMetadata(text: string): GuestMediaMetadata {
	const plainText = stripHtml(text);
	return {
		plainText,
		title: plainText.slice(0, 64) || "Download result",
		description: plainText.slice(0, 128) || undefined,
	};
}

function getReplyMethod(kind: SingleMediaKind) {
	return kind === "image"
		? "replyWithPhoto"
		: kind === "audio"
			? "replyWithAudio"
			: "replyWithVideo";
}

function buildMediaGroupInput(
	item: SendableMediaGroupItem,
	caption?: string,
): InputMediaPhoto | InputMediaVideo {
	return {
		type: item.kind === "image" ? "photo" : "video",
		media: item.media,
		caption,
		parse_mode: caption ? "HTML" : undefined,
	};
}

async function replyWithMediaItems(
	ctx: CustomContext,
	items: SendableMediaGroupItem[],
	text: string,
	replyExtra: ReturnType<typeof buildReplyExtra>,
) {
	if (items.length === 0) {
		return [];
	}

	const sentMessages = [];
	for (let index = 0; index < items.length; index += MAX_MEDIA_GROUP_SIZE) {
		const chunk = items.slice(index, index + MAX_MEDIA_GROUP_SIZE);
		const caption = index === 0 ? text : undefined;

		if (chunk.length === 1) {
			const [item] = chunk;
			const method = getReplyMethod(item.kind);
			const sentMessage = await ctx[method](item.media, {
				caption,
				parse_mode: caption ? "HTML" : undefined,
				...replyExtra,
			});
			sentMessages.push(sentMessage);
			continue;
		}

		sentMessages.push(
			...(await ctx.replyWithMediaGroup(
				chunk.map((item, chunkIndex) =>
					buildMediaGroupInput(item, chunkIndex === 0 ? caption : undefined),
				),
				replyExtra,
			)),
		);
	}

	return sentMessages;
}

function toFileCacheMedia(media: CachedChatMedia): CachedMedia {
	return {
		kind: media.type === "photo" ? "image" : media.type,
		fileId: media.fileId,
	};
}

function buildGuestArticleResult(result: DownloadResponse): GuestQueryResult {
	const { title, description } = buildGuestMediaMetadata(result.text);

	return {
		type: "article",
		id: crypto.randomUUID(),
		title,
		description,
		input_message_content: {
			message_text: result.text,
			parse_mode: "HTML",
			link_preview_options: buildLinkPreviewOptions(result.previewUrl),
		},
	};
}

function buildGuestCachedMediaQueryResult(
	media: CachedMedia,
	text: string,
): GuestQueryResult | null {
	const { title, description } = buildGuestMediaMetadata(text);

	if (media.kind === "images") {
		const item = media.items[0];
		if (!item) {
			return null;
		}

		if (item.kind === "image") {
			return {
				type: "photo",
				id: crypto.randomUUID(),
				photo_file_id: item.fileId,
				title,
				description,
				caption: text,
				parse_mode: "HTML",
			};
		}

		return {
			type: "video",
			id: crypto.randomUUID(),
			video_file_id: item.fileId,
			title,
			description,
			caption: text,
			parse_mode: "HTML",
		};
	}

	if (media.kind === "image") {
		return {
			type: "photo",
			id: crypto.randomUUID(),
			photo_file_id: media.fileId,
			title,
			description,
			caption: text,
			parse_mode: "HTML",
		};
	}

	if (media.kind === "audio") {
		return {
			type: "audio",
			id: crypto.randomUUID(),
			audio_file_id: media.fileId,
			caption: text,
			parse_mode: "HTML",
		};
	}

	return {
		type: "video",
		id: crypto.randomUUID(),
		video_file_id: media.fileId,
		title,
		description,
		caption: text,
		parse_mode: "HTML",
	};
}

function buildGuestCacheChatQueryResult(
	media: CachedChatMedia,
	text: string,
): GuestQueryResult | null {
	return buildGuestCachedMediaQueryResult(toFileCacheMedia(media), text);
}

async function answerGuestQueryWithCachedMedia(
	ctx: CustomContext,
	media: CachedMedia,
	text: string,
	sourceType: string,
	url: string,
) {
	const guestResult = buildGuestCachedMediaQueryResult(media, text);
	if (!guestResult) {
		return false;
	}

	try {
		await ctx.answerGuestQuery(guestResult);
		console.info("[GuestQuery] Answered cached guest query", {
			userId: ctx.from?.id,
			sourceType,
			mediaKind: media.kind,
			resultType: guestResult.type,
			url,
		});
		return true;
	} catch (error) {
		deleteCachedMedia(url);
		console.warn(
			"[GuestQuery] Cached media answer failed; removed cache entry",
			{
				userId: ctx.from?.id,
				sourceType,
				mediaKind: media.kind,
				url,
				error,
			},
		);
		return false;
	}
}

async function buildGuestMediaQueryResult(
	ctx: CustomContext,
	result: DownloadResponse,
	url: string,
): Promise<GuestQueryResult> {
	const { title, description } = buildGuestMediaMetadata(result.text);
	const media = result.media;
	if (!media) {
		return buildGuestArticleResult(result);
	}

	if (media.kind === "images" && media.images.length > 0) {
		try {
			const imageFilenames = await materializeImageFiles(
				media,
				await result.getTempDir(),
			);
			const collageFilename = await createImageCollage(imageFilenames);
			if (collageFilename) {
				const cachedMedia = await cacheDownloadedMedia(
					ctx,
					{
						kind: "image",
						file: new InputFile(collageFilename),
						extension: "jpg",
					},
					url,
				);

				if (cachedMedia?.type === "photo") {
					return {
						type: "photo",
						id: crypto.randomUUID(),
						photo_file_id: cachedMedia.fileId,
						title,
						description,
						caption: result.text,
						parse_mode: "HTML",
					};
				}

				console.info(
					"[GuestQuery] Falling back from collage to article result: cache did not return a photo",
					{ imageCount: media.images.length },
				);
			}
		} catch (error) {
			console.error(
				"[GuestQuery] Falling back from collage to article result: failed to build or cache collage",
				{
					imageCount: media.images.length,
					error,
				},
			);
		}

		console.info(
			"[GuestQuery] Falling back from image media to article result: collage was not available",
			{ imageCount: media.images.length },
		);
		return buildGuestArticleResult(result);
	}

	const cachedMedia = await cacheDownloadedMedia(ctx, media, url);
	if (cachedMedia) {
		const guestResult = buildGuestCacheChatQueryResult(
			cachedMedia,
			result.text,
		);
		if (guestResult) {
			return guestResult;
		}
	}

	console.info(
		"[GuestQuery] Falling back from media to article result: cache upload did not produce reusable media",
		{ mediaKind: media.kind },
	);
	return buildGuestArticleResult(result);
}

async function buildGuestQueryResult(
	ctx: CustomContext,
	result: DownloadResponse,
	url: string,
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
	});
	return await buildGuestMediaQueryResult(ctx, result, url);
}

function getCaptionAuthor(
	ctx: CustomContext,
	sourceMessage: MessageLike | null | undefined,
): CaptionAuthor | null {
	const sourceUser = (sourceMessage as MessageWithAuthor | null | undefined)
		?.from;

	if (sourceUser) {
		return {
			userId: sourceUser.id,
			userName: [sourceUser.first_name, sourceUser.last_name]
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

async function answerGuestQueryWithFallback(
	ctx: CustomContext,
	result: DownloadResponse,
	sourceType: string,
	url: string,
) {
	let guestResult: GuestQueryResult;
	try {
		guestResult = await buildGuestQueryResult(ctx, result, url);
	} catch (error) {
		console.error("[GuestQuery] Failed to build guest query result", {
			userId: ctx.from?.id,
			sourceType,
			mediaKind: result.media?.kind ?? "text",
			url,
			error,
		});
		return false;
	}

	try {
		await ctx.answerGuestQuery(guestResult);
		console.info("[GuestQuery] Answered guest query", {
			userId: ctx.from?.id,
			sourceType,
			mediaKind: result.media?.kind ?? "text",
			resultType: guestResult.type,
			url,
		});
		return true;
	} catch (error) {
		console.error("[GuestQuery] Failed to answer guest query", {
			userId: ctx.from?.id,
			sourceType,
			mediaKind: result.media?.kind ?? "text",
			resultType: guestResult.type,
			url,
			error,
		});
	}

	console.info(
		"[GuestQuery] Falling back to direct text reply after answerGuestQuery failure",
		{
			userId: ctx.from?.id,
			sourceType,
			mediaKind: result.media?.kind ?? "text",
			url,
		},
	);

	try {
		await ctx.reply(result.text, {
			parse_mode: "HTML",
			link_preview_options: buildLinkPreviewOptions(result.previewUrl),
		});
		console.info("[GuestQuery] Sent direct text fallback", {
			userId: ctx.from?.id,
			sourceType,
			url,
		});
		return true;
	} catch (fallbackError) {
		console.error("[GuestQuery] Failed to send direct text fallback", {
			userId: ctx.from?.id,
			sourceType,
			url,
			error: fallbackError,
		});
		return false;
	}
}

export async function downloadMatchedUrl(
	ctx: CustomContext,
	url: string,
	matcher: InputMatcher = matchInput,
	sourceMessage: MessageLike | null | undefined = ctx.msg,
) {
	const captionAuthor = getCaptionAuthor(ctx, sourceMessage);
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

		const responseData = {
			sourceType: type,
			userId: captionAuthor.userId,
			userName: captionAuthor.userName,
			url,
			fallbackUrl: fallbackUrl ?? undefined,
		};
		const replyExtra = buildReplyExtra(ctx);

		const cachedMedia = getCachedMedia(url);
		if (cachedMedia) {
			const cachedText = buildDownloadResponseText(
				ctx,
				responseData,
				cachedMedia.kind,
				undefined,
				cachedMedia.metadata,
			);
			if (ctx.guestMessage) {
				const sent = await answerGuestQueryWithCachedMedia(
					ctx,
					cachedMedia,
					cachedText,
					type,
					url,
				);
				if (sent) {
					return true;
				}
			} else {
				try {
					await replyWithCachedMedia(ctx, cachedMedia, cachedText, replyExtra);
					console.info("[Download] Sent cached media result", {
						userId: ctx.from.id,
						sourceType: type,
						mediaKind: cachedMedia.kind,
						url,
					});
					return true;
				} catch (error) {
					deleteCachedMedia(url);
					console.warn(
						"[Download] Cached media send failed; removed cache entry",
						{
							userId: ctx.from.id,
							sourceType: type,
							mediaKind: cachedMedia.kind,
							url,
							error,
						},
					);
				}
			}
		}

		const result = await buildDownloadResponse(ctx, responseData);

		try {
			console.info("[Download] Built response", {
				userId: ctx.from.id,
				sourceType: type,
				mediaKind: result.media?.kind ?? "text",
				url,
			});

			if (ctx.guestMessage) {
				return await answerGuestQueryWithFallback(ctx, result, type, url);
			}

			if (!result.media) {
				if (result.metadata) {
					await replyWithText(ctx, result, replyExtra);
				} else if (result.reason && USER_FACING_REASONS.has(result.reason)) {
					await replyWithReason(ctx, result, replyExtra);
				} else if (ctx.objects?.chat?.settings?.errors && result.error) {
					await replyWithError(ctx, result, replyExtra);
				} else {
					await replyWithPreviewFallback(ctx, result, replyExtra);
				}
			} else if (result.media.kind === "images") {
				const sentMessages = await replyWithMediaItems(
					ctx,
					result.media.files.map((item) => ({
						kind: item.kind,
						media: item.file,
					})),
					result.text,
					replyExtra,
				);
				const cachedMedia = getCachedMediaFromMediaGroup(sentMessages);
				if (cachedMedia) {
					const normalizedUrl = setCachedMedia(url, {
						...cachedMedia,
						metadata: result.media.metadata,
					});
					console.info("[Download] Cached media group file IDs", {
						userId: ctx.from.id,
						sourceType: type,
						mediaKind: cachedMedia.kind,
						fileCount: cachedMedia.items.length,
						url,
						normalizedUrl,
					});
				}
			} else {
				const method = getReplyMethod(result.media.kind);
				const sentMessage = await ctx[method](result.media.file, {
					caption: result.text,
					parse_mode: "HTML",
					...replyExtra,
				});
				const cachedMedia = getCachedMediaFromSingleMessage(
					result.media.kind,
					sentMessage,
				);
				if (cachedMedia) {
					const normalizedUrl = setCachedMedia(url, {
						...cachedMedia,
						metadata: result.media.metadata,
					});
					console.info("[Download] Cached media file ID", {
						userId: ctx.from.id,
						sourceType: type,
						mediaKind: cachedMedia.kind,
						url,
						normalizedUrl,
					});
				}
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
					await replyWithPreviewFallback(ctx, result, replyExtra);
					console.info(
						"[Download] Sent preview fallback after media send failure",
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
