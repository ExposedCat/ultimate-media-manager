import type { InputRichMessageWithoutUpload } from "grammy/types";
import type { CustomContext } from "../types/context.ts";
import { cacheDownloadedMedia } from "./cache-media.ts";
import { type MessageLike, extractUrlsFromMessage } from "./context-message.ts";
import type { DownloadedMedia } from "./download-media.ts";
import {
	type DownloadResponse,
	buildDownloadResponse,
	buildDownloadResponseBaseText,
	buildDownloadResponseText,
	responseCaptionEnabled,
} from "./download-response.ts";
import { classifyMediaSendFailure, getFailureCode } from "./failure.ts";
import {
	type CachedMedia,
	deleteCachedMedia,
	getCachedMedia,
	getCachedMediaFromMediaGroup,
	getCachedMediaFromRichMessage,
	getCachedMediaFromSingleMessage,
	setCachedMedia,
} from "./media-file-cache.ts";
import {
	type RichMediaItem,
	buildRichMessage,
	buildSenderCredit,
} from "./rich-message.ts";
import {
	type InputMatcher,
	type MatchInputResult,
	type SourceType,
	matchInput,
} from "./sources.ts";

type InputMatcherOrResult = InputMatcher | MatchInputResult;

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
	baseText: string,
	captionEnabled: boolean,
	sourceType: SourceType,
	replyExtra: ReturnType<typeof buildReplyExtra>,
) {
	const mediaItems = cachedMediaItems(media);
	if (containsVideo(mediaItems)) {
		return await replyWithRegularMediaCaptionFallback(
			ctx,
			mediaItems,
			text,
			buildSenderCredit(sourceType, baseText),
			replyExtra,
		);
	}

	return await replyWithCaptionFallback(
		ctx,
		(nextCaptionEnabled) =>
			buildRichMessage({
				baseHtml: baseText,
				captionEnabled: nextCaptionEnabled,
				media: mediaItems,
				metadata: media.metadata,
				sourceType,
			}),
		captionEnabled,
		replyExtra,
	);
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

function stripHtml(text: string) {
	return text.replace(/<[^>]+>/g, "").trim();
}

function buildMediaSendFailureText(ctx: CustomContext, error: unknown) {
	const failure = classifyMediaSendFailure(error);
	return ctx.i18n.t(`error.send.${failure.reason}`, {
		code: failure.code,
	});
}

function buildResultSendFailureText(ctx: CustomContext, error: unknown) {
	return ctx.i18n.t("error.send.resultUnknown", {
		code: getFailureCode(error),
	});
}

function buildDownloadFailureText(
	ctx: CustomContext,
	result: DownloadResponse,
) {
	if (result.reason && USER_FACING_REASONS.has(result.reason)) {
		return ctx.i18n.t("reasonNotice", {
			viewOn: result.text,
			reason: ctx.i18n.t(`reason.${result.reason}`),
		});
	}

	return ctx.i18n.t("error.downloadFailed", {
		code: getFailureCode(result.error),
	});
}

function buildUnexpectedDownloadFailureText(
	ctx: CustomContext,
	error: unknown,
) {
	return ctx.i18n.t("error.downloadFailed", {
		code: getFailureCode(error),
	});
}

async function replyWithMediaSendFailure(
	ctx: CustomContext,
	error: unknown,
	replyExtra: ReturnType<typeof buildReplyExtra>,
) {
	await ctx.reply(buildMediaSendFailureText(ctx, error), {
		parse_mode: "HTML",
		...replyExtra,
	});
}

// Causes worth explaining instead of reducing them to an unknown error code.
const USER_FACING_REASONS = new Set([
	"ageRestricted",
	"private",
	"loginRequired",
	"deleted",
	"notFound",
]);

async function replyWithDownloadFailure(
	ctx: CustomContext,
	result: DownloadResponse,
	replyExtra: ReturnType<typeof buildReplyExtra>,
) {
	await ctx.reply(buildDownloadFailureText(ctx, result), {
		parse_mode: "HTML",
		...replyExtra,
	});
}

// Text-only posts still use the same rich structure, just without media blocks.
async function replyWithText(
	ctx: CustomContext,
	result: DownloadResponse,
	replyExtra: ReturnType<typeof buildReplyExtra>,
) {
	await replyWithCaptionFallback(
		ctx,
		(captionEnabled) => buildResultRichMessage(result, [], captionEnabled),
		result.captionEnabled,
		replyExtra,
	);
}

function buildGuestMediaMetadata(text: string): GuestMediaMetadata {
	const plainText = stripHtml(text);
	return {
		plainText,
		title: plainText.slice(0, 64) || "Download result",
		description: plainText.slice(0, 128) || undefined,
	};
}

function cachedMediaItems(media: CachedMedia): RichMediaItem<string>[] {
	return media.kind === "images"
		? media.items.map((item) => ({ kind: item.kind, media: item.fileId }))
		: [{ kind: media.kind, media: media.fileId }];
}

function downloadedMediaItems(media: DownloadedMedia): RichMediaItem[] {
	return media.kind === "images"
		? media.files.map((item) => ({ kind: item.kind, media: item.file }))
		: [{ kind: media.kind, media: media.file }];
}

const MAX_MEDIA_GROUP_SIZE = 10;

function containsVideo(items: RichMediaItem[]) {
	return items.some((item) => item.kind === "video");
}

async function replyWithRegularMediaItem(
	ctx: CustomContext,
	item: RichMediaItem,
	replyExtra: ReturnType<typeof buildReplyExtra>,
	caption?: string,
) {
	const extra = {
		...(caption && { caption, parse_mode: "HTML" as const }),
		...replyExtra,
	};
	switch (item.kind) {
		case "image":
			return await ctx.replyWithPhoto(item.media, extra);
		case "video":
			return await ctx.replyWithVideo(item.media, extra);
		case "audio":
			return await ctx.replyWithAudio(item.media, extra);
	}
}

async function replyWithRegularMedia(
	ctx: CustomContext,
	items: RichMediaItem[],
	replyExtra: ReturnType<typeof buildReplyExtra>,
	caption?: string,
) {
	const sentMessages: unknown[] = [];
	for (let offset = 0; offset < items.length; offset += MAX_MEDIA_GROUP_SIZE) {
		const chunk = items.slice(offset, offset + MAX_MEDIA_GROUP_SIZE);
		if (chunk.length === 1 || chunk.some((item) => item.kind === "audio")) {
			for (const [index, item] of chunk.entries()) {
				const itemCaption = offset === 0 && index === 0 ? caption : undefined;
				sentMessages.push(
					await replyWithRegularMediaItem(ctx, item, replyExtra, itemCaption),
				);
			}
			continue;
		}

		const mediaGroup = chunk.map((item, index) => {
			const itemCaption = offset === 0 && index === 0 ? caption : undefined;
			const captionData = itemCaption
				? { caption: itemCaption, parse_mode: "HTML" as const }
				: {};
			if (item.kind === "image") {
				return {
					type: "photo" as const,
					media: item.media,
					...captionData,
				};
			}
			if (item.kind === "video") {
				return {
					type: "video" as const,
					media: item.media,
					...captionData,
				};
			}
			throw new Error("Audio cannot be included in a media group");
		});
		sentMessages.push(
			...(await ctx.replyWithMediaGroup(mediaGroup, replyExtra)),
		);
	}

	return sentMessages;
}

async function replyWithRegularMediaCaptionFallback(
	ctx: CustomContext,
	items: RichMediaItem[],
	caption: string,
	fallbackCaption: string,
	replyExtra: ReturnType<typeof buildReplyExtra>,
) {
	try {
		return await replyWithRegularMedia(ctx, items, replyExtra, caption);
	} catch (error) {
		if (
			caption === fallbackCaption ||
			classifyMediaSendFailure(error).reason !== "captionInvalid"
		) {
			throw error;
		}

		console.warn(
			"[Download] Regular media caption failed; retrying without post text",
			{ error },
		);
		return await replyWithRegularMedia(ctx, items, replyExtra, fallbackCaption);
	}
}

function cacheSentMedia(
	url: string,
	media: DownloadedMedia,
	sentMessages: unknown[],
) {
	const cachedMedia =
		media.kind === "images"
			? getCachedMediaFromMediaGroup(sentMessages)
			: getCachedMediaFromSingleMessage(media.kind, sentMessages[0]);
	if (!cachedMedia) {
		return null;
	}

	return setCachedMedia(url, {
		...cachedMedia,
		metadata: media.metadata,
	});
}

function buildResultRichMessage(
	result: DownloadResponse,
	media: RichMediaItem[],
	captionEnabled = result.captionEnabled,
) {
	return buildRichMessage({
		baseHtml: result.baseText,
		captionEnabled,
		media,
		metadata: result.metadata,
		sourceType: result.sourceType,
	});
}

async function replyWithCaptionFallback(
	ctx: CustomContext,
	buildMessage: (
		captionEnabled: boolean,
	) => ReturnType<typeof buildRichMessage>,
	captionEnabled: boolean,
	replyExtra: ReturnType<typeof buildReplyExtra>,
) {
	try {
		return await ctx.replyWithRichMessage(
			buildMessage(captionEnabled),
			replyExtra,
		);
	} catch (error) {
		if (
			!captionEnabled ||
			classifyMediaSendFailure(error).reason !== "captionInvalid"
		) {
			throw error;
		}

		console.warn("[Download] Caption failed; retrying without it", { error });
		return await ctx.replyWithRichMessage(buildMessage(false), replyExtra);
	}
}

function buildGuestArticleResultFromText(text: string): GuestQueryResult {
	const { title, description } = buildGuestMediaMetadata(text);

	return {
		type: "article",
		id: crypto.randomUUID(),
		title,
		description,
		input_message_content: {
			message_text: text,
			parse_mode: "HTML",
			link_preview_options: { is_disabled: true },
		},
	};
}

function buildGuestRichArticleResult(
	text: string,
	richMessage: InputRichMessageWithoutUpload,
): GuestQueryResult {
	const { title, description } = buildGuestMediaMetadata(text);
	return {
		type: "article",
		id: crypto.randomUUID(),
		title,
		description,
		input_message_content: { rich_message: richMessage },
	};
}

function buildGuestVideoResult(text: string, fileId: string): GuestQueryResult {
	const { title, description } = buildGuestMediaMetadata(text);
	return {
		type: "video",
		id: crypto.randomUUID(),
		video_file_id: fileId,
		title,
		description,
		caption: text,
		parse_mode: "HTML",
	};
}

async function answerGuestResultWithCaptionFallback(
	ctx: CustomContext,
	guestResult: GuestQueryResult,
	captionEnabled: boolean,
	buildWithoutCaption: () => GuestQueryResult | Promise<GuestQueryResult>,
) {
	try {
		await ctx.answerGuestQuery(guestResult);
		return guestResult;
	} catch (error) {
		if (
			!captionEnabled ||
			classifyMediaSendFailure(error).reason !== "captionInvalid"
		) {
			throw error;
		}

		console.warn("[GuestQuery] Caption failed; retrying without it", {
			error,
		});
		const captionlessResult = await buildWithoutCaption();
		await ctx.answerGuestQuery(captionlessResult);
		return captionlessResult;
	}
}

async function answerGuestFailure(
	ctx: CustomContext,
	text: string,
	sourceType: string,
	url: string,
) {
	try {
		await ctx.answerGuestQuery(buildGuestArticleResultFromText(text));
		console.info("[GuestQuery] Answered with failure notice", {
			userId: ctx.from?.id,
			sourceType,
			url,
		});
	} catch (error) {
		console.error("[GuestQuery] Failed to answer with failure notice", {
			userId: ctx.from?.id,
			sourceType,
			url,
			error,
		});
	}
}

async function answerGuestQueryWithCachedMedia(
	ctx: CustomContext,
	media: CachedMedia,
	text: string,
	baseText: string,
	captionEnabled: boolean,
	sourceType: SourceType,
	url: string,
) {
	const fallbackText = buildSenderCredit(sourceType, baseText);
	const buildGuestResult = (nextCaptionEnabled: boolean) =>
		media.kind === "video"
			? buildGuestVideoResult(
					nextCaptionEnabled ? text : fallbackText,
					media.fileId,
				)
			: buildGuestRichArticleResult(
					text,
					buildRichMessage({
						baseHtml: baseText,
						captionEnabled: nextCaptionEnabled,
						media: cachedMediaItems(media),
						metadata: media.metadata,
						sourceType,
					}),
				);
	const guestResult = buildGuestResult(captionEnabled);

	try {
		const sentResult = await answerGuestResultWithCaptionFallback(
			ctx,
			guestResult,
			captionEnabled,
			() => buildGuestResult(false),
		);
		console.info("[GuestQuery] Answered cached guest query", {
			userId: ctx.from?.id,
			sourceType,
			mediaKind: media.kind,
			resultType: sentResult.type,
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

async function buildGuestQueryResult(
	ctx: CustomContext,
	result: DownloadResponse,
	url: string,
	captionEnabled = result.captionEnabled,
): Promise<GuestQueryResult> {
	const cachedMedia = result.media
		? await cacheDownloadedMedia(ctx, result.media, url)
		: null;
	if (cachedMedia) {
		if (cachedMedia.kind === "video") {
			return buildGuestVideoResult(
				captionEnabled
					? result.text
					: buildSenderCredit(result.sourceType, result.baseText),
				cachedMedia.fileId,
			);
		}
		return buildGuestRichArticleResult(
			result.text,
			buildRichMessage({
				baseHtml: result.baseText,
				captionEnabled,
				media: cachedMediaItems(cachedMedia),
				metadata: result.metadata,
				sourceType: result.sourceType,
			}),
		);
	}

	if (result.media) {
		console.info(
			"[GuestQuery] Falling back to a media-free rich result: cache upload did not produce reusable media",
			{ mediaKind: result.media.kind },
		);
	} else {
		console.info(
			"[GuestQuery] Using rich article result for text-only response",
		);
	}
	return buildGuestRichArticleResult(
		result.text,
		buildRichMessage({
			baseHtml: result.baseText,
			captionEnabled,
			media: [] as RichMediaItem<string>[],
			metadata: result.metadata,
			sourceType: result.sourceType,
		}),
	);
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

async function answerGuestQuery(
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
		await answerGuestFailure(
			ctx,
			result.media
				? buildMediaSendFailureText(ctx, error)
				: buildResultSendFailureText(ctx, error),
			sourceType,
			url,
		);
		return false;
	}

	try {
		guestResult = await answerGuestResultWithCaptionFallback(
			ctx,
			guestResult,
			result.captionEnabled,
			() => buildGuestQueryResult(ctx, result, url, false),
		);
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
		await answerGuestFailure(
			ctx,
			result.media
				? buildMediaSendFailureText(ctx, error)
				: buildResultSendFailureText(ctx, error),
			sourceType,
			url,
		);
	}

	return false;
}

export async function downloadPlainMatchedUrl(
	ctx: CustomContext,
	url: string,
	matcherOrResult: InputMatcherOrResult = matchInput,
) {
	if (!ctx.from) {
		return false;
	}

	const { type, fallbackUrl, match } =
		typeof matcherOrResult === "function"
			? matcherOrResult(url)
			: matcherOrResult;
	if (!type || !match) {
		console.info("[PlainDownload] No matcher found", {
			userId: ctx.from.id,
			url,
		});
		return false;
	}

	const finish = (result: boolean) => {
		try {
			ctx.telemetry.event("download", {
				platform: type,
				url,
				result,
			});
		} catch (error) {
			console.warn("[PlainDownload] Failed to emit telemetry event", {
				platform: type,
				url,
				result,
				error,
			});
		}
		return result;
	};
	const replyExtra = buildReplyExtra(ctx);

	console.info("[PlainDownload] Matched URL", {
		userId: ctx.from.id,
		sourceType: type,
		url,
		fallbackUrl,
	});

	try {
		const cachedMedia = getCachedMedia(url);
		if (cachedMedia) {
			try {
				await replyWithRegularMedia(
					ctx,
					cachedMediaItems(cachedMedia),
					replyExtra,
				);
				console.info("[PlainDownload] Sent cached media", {
					userId: ctx.from.id,
					sourceType: type,
					mediaKind: cachedMedia.kind,
					url,
				});
				return finish(true);
			} catch (error) {
				deleteCachedMedia(url);
				console.warn(
					"[PlainDownload] Cached media send failed; removed cache entry",
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

		const responseData = {
			sourceType: type,
			userId: ctx.from.id,
			userName: [ctx.from.first_name, ctx.from.last_name]
				.filter(Boolean)
				.join(" "),
			url,
			fallbackUrl: fallbackUrl ?? undefined,
		};
		const result = await buildDownloadResponse(ctx, responseData);
		if (!result.media) {
			if (result.metadata) {
				await ctx.reply(ctx.i18n.t("error.noMedia"), {
					parse_mode: "HTML",
					...replyExtra,
				});
			} else {
				await replyWithDownloadFailure(ctx, result, replyExtra);
			}
			return finish(false);
		}

		try {
			const sentMessages = await replyWithRegularMedia(
				ctx,
				downloadedMediaItems(result.media),
				replyExtra,
			);
			const normalizedUrl = cacheSentMedia(url, result.media, sentMessages);
			console.info("[PlainDownload] Sent media", {
				userId: ctx.from.id,
				sourceType: type,
				mediaKind: result.media.kind,
				url,
				normalizedUrl,
			});
			return finish(true);
		} catch (error) {
			console.error("[PlainDownload] Failed to send media", {
				userId: ctx.from.id,
				sourceType: type,
				mediaKind: result.media.kind,
				url,
				error,
			});
			try {
				await replyWithMediaSendFailure(ctx, error, replyExtra);
			} catch (noticeError) {
				console.error("[PlainDownload] Failed to send failure notice", {
					userId: ctx.from.id,
					sourceType: type,
					url,
					error: noticeError,
				});
			}
			return finish(false);
		}
	} catch (error) {
		console.error("[PlainDownload] Failed to download media", {
			userId: ctx.from.id,
			sourceType: type,
			url,
			error,
		});
		try {
			await ctx.reply(buildUnexpectedDownloadFailureText(ctx, error), {
				parse_mode: "HTML",
				...replyExtra,
			});
		} catch (noticeError) {
			console.error("[PlainDownload] Failed to send download failure notice", {
				userId: ctx.from.id,
				sourceType: type,
				url,
				error: noticeError,
			});
		}
		return finish(false);
	}
}

export async function downloadMatchedUrl(
	ctx: CustomContext,
	url: string,
	matcherOrResult: InputMatcherOrResult = matchInput,
	sourceMessage: MessageLike | null | undefined = ctx.msg,
) {
	const captionAuthor = getCaptionAuthor(ctx, sourceMessage);
	if (!ctx.from || !captionAuthor) {
		return false;
	}

	const { type, fallbackUrl, match } =
		typeof matcherOrResult === "function"
			? matcherOrResult(url)
			: matcherOrResult;
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
	const finish = (result: boolean) => {
		try {
			ctx.telemetry.event("download", {
				platform: type,
				url,
				result,
			});
		} catch (error) {
			console.warn("[Download] Failed to emit telemetry event", {
				platform: type,
				url,
				result,
				error,
			});
		}
		return result;
	};
	const replyExtra = buildReplyExtra(ctx);

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
		const cachedMedia = getCachedMedia(url);
		if (cachedMedia) {
			const cachedBaseText = buildDownloadResponseBaseText(
				ctx,
				responseData,
				cachedMedia.kind,
			);
			const cachedCaptionEnabled = responseCaptionEnabled(ctx, type);
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
					cachedBaseText,
					cachedCaptionEnabled,
					type,
					url,
				);
				if (sent) {
					return finish(true);
				}
			} else {
				try {
					await replyWithCachedMedia(
						ctx,
						cachedMedia,
						cachedText,
						cachedBaseText,
						cachedCaptionEnabled,
						type,
						replyExtra,
					);
					console.info("[Download] Sent cached media result", {
						userId: ctx.from.id,
						sourceType: type,
						mediaKind: cachedMedia.kind,
						url,
					});
					return finish(true);
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
				if (!result.media && !result.metadata) {
					await answerGuestFailure(
						ctx,
						buildDownloadFailureText(ctx, result),
						type,
						url,
					);
					return finish(false);
				}
				return finish(await answerGuestQuery(ctx, result, type, url));
			}

			if (!result.media) {
				if (result.metadata) {
					await replyWithText(ctx, result, replyExtra);
				} else {
					await replyWithDownloadFailure(ctx, result, replyExtra);
					console.info("[Download] Sent download failure notice", {
						userId: ctx.from.id,
						sourceType: type,
						reason: result.reason,
						url,
					});
					return finish(false);
				}
			} else {
				const media = result.media;
				const mediaItems = downloadedMediaItems(media);
				if (containsVideo(mediaItems)) {
					const sentMessages = await replyWithRegularMediaCaptionFallback(
						ctx,
						mediaItems,
						result.text,
						buildSenderCredit(result.sourceType, result.baseText),
						replyExtra,
					);
					const normalizedUrl = cacheSentMedia(url, media, sentMessages);
					console.info("[Download] Cached regular media file IDs", {
						userId: ctx.from.id,
						sourceType: type,
						mediaKind: media.kind,
						url,
						normalizedUrl,
					});
				} else {
					const sentMessage = await replyWithCaptionFallback(
						ctx,
						(captionEnabled) =>
							buildResultRichMessage(result, mediaItems, captionEnabled),
						result.captionEnabled,
						replyExtra,
					);
					const cachedMedia = getCachedMediaFromRichMessage(sentMessage);
					if (cachedMedia) {
						const normalizedUrl = setCachedMedia(url, {
							...cachedMedia,
							metadata: media.metadata,
						});
						console.info("[Download] Cached rich media file IDs", {
							userId: ctx.from.id,
							sourceType: type,
							mediaKind: cachedMedia.kind,
							fileCount:
								cachedMedia.kind === "images" ? cachedMedia.items.length : 1,
							url,
							normalizedUrl,
						});
					}
				}
			}

			console.info("[Download] Sent result", {
				userId: ctx.from.id,
				sourceType: type,
				mediaKind: result.media?.kind ?? "text",
				url,
			});
			return finish(true);
		} catch (error) {
			console.error("[Failed to send result]", {
				userId: ctx.from.id,
				sourceType: type,
				mediaKind: result.media?.kind ?? "text",
				url,
				error,
			});

			if (result.media || result.metadata) {
				try {
					if (result.media) {
						await replyWithMediaSendFailure(ctx, error, replyExtra);
					} else {
						await ctx.reply(buildResultSendFailureText(ctx, error), {
							parse_mode: "HTML",
							...replyExtra,
						});
					}
					console.info("[Download] Sent delivery failure notice", {
						userId: ctx.from.id,
						sourceType: type,
						url,
					});
				} catch (noticeError) {
					console.error("[Download] Failed to send delivery failure notice", {
						userId: ctx.from.id,
						sourceType: type,
						url,
						error: noticeError,
					});
				}
			}

			return finish(false);
		}
	} catch (error) {
		console.error("[Failed to download media]", {
			userId: ctx.from.id,
			sourceType: type,
			url,
			error,
		});
		const failureText = buildUnexpectedDownloadFailureText(ctx, error);
		if (ctx.guestMessage) {
			await answerGuestFailure(ctx, failureText, type, url);
		} else {
			try {
				await ctx.reply(failureText, {
					parse_mode: "HTML",
					...replyExtra,
				});
			} catch (noticeError) {
				console.error("[Download] Failed to send download failure notice", {
					userId: ctx.from.id,
					sourceType: type,
					url,
					error: noticeError,
				});
			}
		}
		return finish(false);
	}
}
