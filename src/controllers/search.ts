import { Composer, InlineKeyboard, InlineQueryResultBuilder } from "grammy";
import { matchInput } from "../services/sources.js";

import type { CustomContext } from "../types/context.js";

const THUMBNAIL_URL =
	"https://external-content.duckduckgo.com/iu/?u=https%3A%2F%2Fcdn4.iconfinder.com%2Fdata%2Ficons%2Farrows-245%2F24%2Fdownload_1-1024.png&f=1&nofb=1&ipt=fe03aaef09431f64f583d6239a6a6423af9fd2375434e98f80eff03b0119a485";

type SearchEntry = {
	url: string;
	title: string;
	content?: string;
	img_src?: string;
};

type SearchApiResponse = {
	results: SearchEntry[];
};

async function searchImages(query: string) {
	const uri = `http://127.0.0.1:8088/search?format=json&categories=images&q=${encodeURIComponent(query)}`;
	try {
		const request = await fetch(uri);
		const response = (await request.json()) as SearchApiResponse;
		const formatted = response.results.map((result) => {
			return {
				url: result.url,
				title: result.title,
				content: result.content,
				image: result.img_src,
			};
		});
		return { ok: true, result: formatted, error: null };
	} catch (error) {
		return {
			ok: false,
			result: null,
			error: `${error}`.trim() || "Unknown Error",
		};
	}
}

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
				thumbnail_url: THUMBNAIL_URL,
				description: ctx.i18n.t("inline.description"),
			}).text(ctx.i18n.t("inline.content")),
		]);
		return;
	}

	const result = await searchImages(ctx.inlineQuery.query);

	if (result.ok) {
		// biome-ignore lint/style/noNonNullAssertion: result.ok means result.result is not null
		const results = result
			.result!.slice(0, 50)
			.map((image, i) =>
				InlineQueryResultBuilder.photo(i.toString(), image.url),
			);
		await ctx.answerInlineQuery(results);
	}
});
