import { Composer, InlineKeyboard, InlineQueryResultBuilder } from "grammy";
import { searchJpegImages } from "../services/search.js";
import { matchInput } from "../services/sources.js";

import type { CustomContext } from "../types/context.js";

const DOWNLOAD_THUMBNAIL_IMAGE_URL =
	"https://external-content.duckduckgo.com/iu/?u=https%3A%2F%2Fcdn4.iconfinder.com%2Fdata%2Ficons%2Farrows-245%2F24%2Fdownload_1-1024.png&f=1&nofb=1&ipt=fe03aaef09431f64f583d6239a6a6423af9fd2375434e98f80eff03b0119a485";

export const searchController = new Composer<CustomContext>();

searchController.on("chosen_inline_result", async (ctx) => {
	const urlMatch = matchInput(ctx.chosenInlineResult.query);
	if (urlMatch.type) {
		const result = await urlMatch.adapter(ctx, {
			source: urlMatch,
			userId: ctx.from.id,
			userName: ctx.from.first_name,
			url: ctx.chosenInlineResult.query,
			proxyUrl: urlMatch.proxyUrl,
		});
		if (result.kind === "text") {
			await ctx.api.editMessageTextInline(
				// biome-ignore lint/style/noNonNullAssertion: Button is always attached below
				ctx.chosenInlineResult.inline_message_id!,
				result.caption,
				{
					parse_mode: "HTML",
					link_preview_options: {
						is_disabled: false,
						url: urlMatch.proxyUrl,
						show_above_text: true,
						prefer_large_media: true,
					},
				},
			);
		} else if (
			result.kind === "video" ||
			result.kind === "audio" ||
			result.kind === "image"
		) {
			const method =
				result.kind === "video"
					? "sendVideo"
					: result.kind === "audio"
						? "sendAudio"
						: "sendPhoto";

			const media = await ctx.api[method](
				Number(process.env.CACHE_CHAT_ID),
				result.file,
			);

			const fileId =
				"video" in media
					? media.video.file_id
					: "audio" in media
						? media.audio.file_id
						: "photo" in media
							? // biome-ignore lint/style/noNonNullAssertion: always present
								media.photo.at(-1)!.file_id
							: null;

			// biome-ignore lint/style/noNonNullAssertion: Button is always attached below
			const messageId = ctx.chosenInlineResult.inline_message_id!;

			if (!fileId) {
				await ctx.api.editMessageTextInline(
					messageId,
					ctx.i18n.t(`error.${result.kind}`),
				);
				return;
			}

			await ctx.api.editMessageMediaInline(messageId, {
				type: result.kind === "image" ? "photo" : result.kind,
				media: fileId,
				caption: result.caption,
				parse_mode: "HTML",
			});
		}
	}
});

// searchController.on("msg:video", (ctx) =>
// 	console.log(ctx.message?.video.file_id),
// );

searchController.on("inline_query", async (ctx) => {
	if (!ctx.inlineQuery.query) return;

	const urlMatch = matchInput(ctx.inlineQuery.query);
	if (urlMatch.adapter) {
		await ctx.answerInlineQuery([
			InlineQueryResultBuilder.article("post", ctx.i18n.t("inline.title"), {
				reply_markup: new InlineKeyboard().text(
					ctx.i18n.t("inline.button", {
						source: `${urlMatch.type[0].toUpperCase()}${urlMatch.type.slice(1)}`,
					}),
				),
				thumbnail_url: DOWNLOAD_THUMBNAIL_IMAGE_URL,
				description: ctx.i18n.t("inline.description"),
			}).text(ctx.i18n.t("inline.content")),
		]);
		return;
	}

	const offset = Number.parseInt(ctx.inlineQuery.offset || "0");
	const images = await searchJpegImages(ctx.inlineQuery.query);
	const paginatedImages = images.slice(offset, offset + 50);
	const results = paginatedImages.map((image, i) =>
		InlineQueryResultBuilder.photo((offset + i).toString(), image.imageUrl, {
			caption: `<a href="${image.sourceUrl}">source</a>`,
			parse_mode: "HTML",
			thumbnail_url: image.thumbnailUrl,
		}),
	);

	await ctx.answerInlineQuery(results, {
		next_offset: (offset + paginatedImages.length).toString(),
	});
});
