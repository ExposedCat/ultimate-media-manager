import { Composer, InlineQueryResultBuilder } from "grammy";

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
		console.log(response);
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
searchController.on("inline_query", async (ctx) => {
	const result = await searchImages(ctx.inlineQuery.query);

	if (result.ok) {
		console.log(result.result?.length);
		// biome-ignore lint/style/noNonNullAssertion: <explanation>
		const results = result
			.result!.slice(0, 50)
			.map((image, i) =>
				InlineQueryResultBuilder.photo(i.toString(), image.url),
			);
		await ctx.answerInlineQuery(results);
	}
});
