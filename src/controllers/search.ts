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
			url: urlMatch.proxyUrl,
		});
		if (result.kind === "text" || !result.file) {
			await ctx.api.editMessageCaptionInline(
				// biome-ignore lint/style/noNonNullAssertion: <explanation>
				ctx.chosenInlineResult.inline_message_id!,
				{
					caption: `${result.caption}\n\n<i>${humanifyError(result.error ?? "Failed to download video")}</i>`,
					parse_mode: "HTML",
				},
			);
		} else if (result.file) {
			const video = await ctx.api.sendVideo(849670500, result.file);
			await ctx.api.editMessageMediaInline(
				// biome-ignore lint/style/noNonNullAssertion: <explanation>
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
			InlineQueryResultBuilder.videoCached(
				"post",
				`${urlMatch.type[0].toUpperCase()}${urlMatch.type.slice(1)} video`,
				"BAACAgIAAxkBAAEBdjdnyiXmDyYgA0-dY9IF87XbVLTgkwAC0HMAAuwiUUqsm64AAYXv8t02BA",
				{ reply_markup: new InlineKeyboard().text("Downloading...") },
			),
		]);
		return;
	}

	const result = await searchImages(ctx.inlineQuery.query);

	if (result.ok) {
		// biome-ignore lint/style/noNonNullAssertion: <explanation>
		const results = result
			.result!.slice(0, 50)
			.map((image, i) =>
				InlineQueryResultBuilder.photo(i.toString(), image.url),
			);
		await ctx.answerInlineQuery(results);
	}
});
