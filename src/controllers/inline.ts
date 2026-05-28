import { Composer, InlineKeyboard, InlineQueryResultBuilder } from "grammy";

import { cacheDownloadedMedia } from "../services/cache-media.ts";
import {
	type DownloadResponse,
	buildDownloadResponse,
	buildLinkPreviewOptions,
} from "../services/download-response.ts";
import { matchInput } from "../services/sources.ts";
import type { CustomContext } from "../types/context.ts";

const DOWNLOAD_THUMBNAIL_IMAGE_URL =
	"https://external-content.duckduckgo.com/iu/?u=https%3A%2F%2Fcdn4.iconfinder.com%2Fdata%2Ficons%2Farrows-245%2F24%2Fdownload_1-1024.png&f=1&nofb=1&ipt=fe03aaef09431f64f583d6239a6a6423af9fd2375434e98f80eff03b0119a485";

export const inlineController = new Composer<CustomContext>();

function getInlineQueryLogContext(ctx: CustomContext) {
	return {
		userId: ctx.from?.id,
		query: ctx.inlineQuery?.query ?? null,
	};
}

function getChosenInlineLogContext(ctx: CustomContext) {
	return {
		userId: ctx.from?.id,
		query: ctx.chosenInlineResult?.query ?? null,
		inlineMessageId: ctx.chosenInlineResult?.inline_message_id ?? null,
	};
}

function getInlineText(ctx: CustomContext, result: DownloadResponse) {
	if (result.media?.kind !== "images") {
		return result.text;
	}

	return `${result.text}\n\n${ctx.i18n.t("inline.multiplePhotosUnsupported")}`;
}

async function editInlineMessageWithCaption(
	ctx: CustomContext,
	messageId: string,
	text: string,
	previewUrl: string,
) {
	await ctx.api.editMessageTextInline(messageId, text, {
		parse_mode: "HTML",
		link_preview_options: buildLinkPreviewOptions(previewUrl),
	});
}

inlineController.on("chosen_inline_result", async (ctx) => {
	console.info("[InlineChosen] Received chosen inline result", {
		...getChosenInlineLogContext(ctx),
	});

	if (!ctx.from) {
		console.warn(
			"[InlineChosen] Missing sender",
			getChosenInlineLogContext(ctx),
		);
		return;
	}

	const urlMatch = matchInput(ctx.chosenInlineResult.query);
	if (!urlMatch.type) {
		console.info("[InlineChosen] No matcher found", {
			...getChosenInlineLogContext(ctx),
		});
		return;
	}

	// biome-ignore lint/style/noNonNullAssertion: Telegram supplies this for inline messages
	const messageId = ctx.chosenInlineResult.inline_message_id!;
	let result: DownloadResponse | undefined;
	let inlineText: string | undefined;

	try {
		console.info("[InlineChosen] Building inline response", {
			...getChosenInlineLogContext(ctx),
			sourceType: urlMatch.type,
			url: ctx.chosenInlineResult.query,
		});

		result = await buildDownloadResponse(ctx, {
			sourceType: urlMatch.type,
			userId: ctx.from.id,
			userName: ctx.from.first_name,
			url: ctx.chosenInlineResult.query,
			fallbackUrl: urlMatch.fallbackUrl ?? undefined,
		});
		inlineText = getInlineText(ctx, result);
		console.info("[InlineChosen] Built inline response", {
			...getChosenInlineLogContext(ctx),
			sourceType: urlMatch.type,
			mediaKind: result.media?.kind ?? "text",
			previewUrl: result.previewUrl,
		});

		if (!result.media) {
			console.info("[InlineChosen] Editing inline message as text", {
				...getChosenInlineLogContext(ctx),
				sourceType: urlMatch.type,
			});
			await editInlineMessageWithCaption(
				ctx,
				messageId,
				inlineText,
				result.previewUrl,
			);
			return;
		}

		const method =
			result.media.kind === "video"
				? "sendVideo"
				: result.media.kind === "audio"
					? "sendAudio"
					: "sendPhoto";

		const mediaFile =
			result.media.kind === "images"
				? result.media.files[0]
				: result.media.file;
		if (!mediaFile) {
			console.info("[InlineChosen] Missing media file, falling back to text", {
				...getChosenInlineLogContext(ctx),
				sourceType: urlMatch.type,
				mediaKind: result.media.kind,
			});
			await editInlineMessageWithCaption(
				ctx,
				messageId,
				inlineText,
				result.previewUrl,
			);
			return;
		}

		const cachedMedia = await cacheDownloadedMedia(ctx, result.media);
		if (!cachedMedia) {
			console.info(
				"[InlineChosen] Missing cached file id, falling back to text",
				{
					...getChosenInlineLogContext(ctx),
					sourceType: urlMatch.type,
					mediaKind: result.media.kind,
				},
			);
			await editInlineMessageWithCaption(
				ctx,
				messageId,
				inlineText,
				result.previewUrl,
			);
			return;
		}

		await ctx.api.editMessageMediaInline(messageId, {
			type: cachedMedia.type,
			media: cachedMedia.fileId,
			caption: inlineText,
			parse_mode: "HTML",
		});
		console.info("[InlineChosen] Edited inline message with media", {
			...getChosenInlineLogContext(ctx),
			sourceType: urlMatch.type,
			mediaKind: result.media.kind,
		});
	} catch (error) {
		console.error("[Inline] Failed to send inline result", {
			userId: ctx.from.id,
			sourceType: urlMatch.type,
			url: ctx.chosenInlineResult.query,
			error,
		});

		console.info("[InlineChosen] Falling back to text after failure", {
			...getChosenInlineLogContext(ctx),
			sourceType: urlMatch.type,
		});
		await editInlineMessageWithCaption(
			ctx,
			messageId,
			inlineText ?? result?.text ?? ctx.chosenInlineResult.query,
			result?.previewUrl ??
				urlMatch.fallbackUrl ??
				ctx.chosenInlineResult.query,
		);
	} finally {
		if (result) {
			console.info("[InlineChosen] Cleaning up inline response resources", {
				...getChosenInlineLogContext(ctx),
				sourceType: urlMatch.type,
			});
			await result.cleanup();
		}
	}
});

inlineController.on("inline_query", async (ctx) => {
	console.info("[InlineQuery] Received inline query", {
		...getInlineQueryLogContext(ctx),
	});

	const query = ctx.inlineQuery.query.trim();
	if (!query) {
		console.info("[InlineQuery] Empty query, returning no results", {
			...getInlineQueryLogContext(ctx),
		});
		await ctx.answerInlineQuery([], { cache_time: 0 });
		return;
	}

	const urlMatch = matchInput(query);
	if (!urlMatch.type) {
		console.info("[InlineQuery] No matcher found, returning no results", {
			...getInlineQueryLogContext(ctx),
		});
		await ctx.answerInlineQuery([], { cache_time: 0 });
		return;
	}

	console.info("[InlineQuery] Returning inline result", {
		...getInlineQueryLogContext(ctx),
		sourceType: urlMatch.type,
		url: query,
	});
	await ctx.answerInlineQuery(
		[
			InlineQueryResultBuilder.article("post", ctx.i18n.t("inline.title"), {
				reply_markup: new InlineKeyboard().text(
					ctx.i18n.t("inline.button", {
						source: `${urlMatch.type[0].toUpperCase()}${urlMatch.type.slice(1)}`,
					}),
				),
				thumbnail_url: DOWNLOAD_THUMBNAIL_IMAGE_URL,
				description: ctx.i18n.t("inline.description"),
			}).text(ctx.i18n.t("inline.content")),
		],
		{ cache_time: 0 },
	);
	console.info("[InlineQuery] Answered inline query", {
		...getInlineQueryLogContext(ctx),
		sourceType: urlMatch.type,
		url: query,
	});
});
