import { Composer, InlineKeyboard, InlineQueryResultBuilder } from "grammy";

import { APP_ENV } from "../config/env.ts";
import type { MediaAdapterResult } from "../services/media-adapters.ts";
import { matchInput } from "../services/sources.ts";
import type { CustomContext } from "../types/context.ts";

const DOWNLOAD_THUMBNAIL_IMAGE_URL =
	"https://external-content.duckduckgo.com/iu/?u=https%3A%2F%2Fcdn4.iconfinder.com%2Fdata%2Ficons%2Farrows-245%2F24%2Fdownload_1-1024.png&f=1&nofb=1&ipt=fe03aaef09431f64f583d6239a6a6423af9fd2375434e98f80eff03b0119a485";

export const inlineController = new Composer<CustomContext>();

function getInlineFallbackCaption(ctx: CustomContext, url: string, type: string) {
	if (!ctx.from) {
		return url;
	}

	return ctx.i18n.t("promoCaption", {
		viewUrl: ctx.i18n.t(`viewOn.${type}`, {
			kind: "post",
			postUrl: url,
			userName: ctx.from.first_name,
			userId: ctx.from.id,
		}),
	});
}

async function editInlineMessageWithCaption(
	ctx: CustomContext,
	messageId: string,
	caption: string,
	result?: MediaAdapterResult,
) {
	const linkPreviewOptions = result?.extra?.link_preview_options;

	await ctx.api.editMessageTextInline(messageId, caption, {
		parse_mode: "HTML",
		...(linkPreviewOptions ? { link_preview_options: linkPreviewOptions } : {}),
	});
}

inlineController.on("chosen_inline_result", async (ctx) => {
	if (!ctx.from) {
		return;
	}

	const urlMatch = matchInput(ctx.chosenInlineResult.query);
	if (!urlMatch.type || !urlMatch.adapter) {
		return;
	}

	// biome-ignore lint/style/noNonNullAssertion: Telegram supplies this for inline messages
	const messageId = ctx.chosenInlineResult.inline_message_id!;
	let result: MediaAdapterResult | undefined;

	try {
		result = await urlMatch.adapter(ctx, {
			source: urlMatch,
			userId: ctx.from.id,
			userName: ctx.from.first_name,
			url: ctx.chosenInlineResult.query,
			proxyUrl: urlMatch.proxyUrl,
		});

		if (result.kind === "text") {
			await editInlineMessageWithCaption(ctx, messageId, result.caption, result);
			return;
		}

		if (
			result.kind !== "video" &&
			result.kind !== "audio" &&
			result.kind !== "image"
		) {
			await editInlineMessageWithCaption(ctx, messageId, result.caption, result);
			return;
		}

		const method =
			result.kind === "video"
				? "sendVideo"
				: result.kind === "audio"
					? "sendAudio"
					: "sendPhoto";

		const media = await ctx.api[method](Number(APP_ENV.CACHE_CHAT_ID), result.file);
		const fileId =
			"video" in media
				? media.video.file_id
				: "audio" in media
					? media.audio.file_id
					: "photo" in media
						? // biome-ignore lint/style/noNonNullAssertion: Telegram always includes the uploaded photo sizes
							media.photo.at(-1)!.file_id
						: null;

		if (!fileId) {
			await editInlineMessageWithCaption(ctx, messageId, result.caption, result);
			return;
		}

		await ctx.api.editMessageMediaInline(messageId, {
			type: result.kind === "image" ? "photo" : result.kind,
			media: fileId,
			caption: result.caption,
			parse_mode: "HTML",
		});
	} catch (error) {
		console.error("[Inline] Failed to send inline result", {
			userId: ctx.from.id,
			sourceType: urlMatch.type,
			url: ctx.chosenInlineResult.query,
			error,
		});

		await editInlineMessageWithCaption(
			ctx,
			messageId,
			result?.caption ??
				getInlineFallbackCaption(ctx, ctx.chosenInlineResult.query, urlMatch.type),
			result,
		);
	} finally {
		if (result) {
			await result.cleanup();
		}
	}
});

inlineController.on("inline_query", async (ctx) => {
	const query = ctx.inlineQuery.query.trim();
	if (!query) {
		await ctx.answerInlineQuery([], { cache_time: 0 });
		return;
	}

	const urlMatch = matchInput(query);
	if (!urlMatch.type) {
		await ctx.answerInlineQuery([], { cache_time: 0 });
		return;
	}

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
});
