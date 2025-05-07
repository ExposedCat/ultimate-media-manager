import { Composer, InlineKeyboard, InlineQueryResultBuilder } from "grammy";
import { matchInput } from "../services/sources.js";
import { humanifyError } from "../services/yt-dlp.js";

import type { CustomContext } from "../types/context.js";

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
		if (result.kind === "text" || !result.file) {
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
		} else if (result.file) {
			const video = await ctx.api.sendVideo(
				Number(process.env.CACHE_CHAT_ID),
				result.file,
			);
			await ctx.api.editMessageMediaInline(
				// biome-ignore lint/style/noNonNullAssertion: Button is always attached below
				ctx.chosenInlineResult.inline_message_id!,
				{
					type: "video",
					media: video.video.file_id,
					caption: result.caption,
					parse_mode: "HTML",
				},
			);
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
			InlineQueryResultBuilder.article("test", "Share post", {
				reply_markup: new InlineKeyboard().text(
					`⏳ Downloading ${urlMatch.type[0].toUpperCase()}${urlMatch.type.slice(1)} video...`,
				),
			}).text("⁠"),
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
