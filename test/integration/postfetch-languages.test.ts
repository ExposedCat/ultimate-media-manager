import { assertEquals, assertStringIncludes } from "jsr:@std/assert@^1";
import type { InputRichMessage } from "grammy/types";
import { DEFAULT_SETTINGS } from "../../src/services/chat.ts";
import { downloadMatchedUrl } from "../../src/services/url-download.ts";
import type { CustomContext } from "../../src/types/context.ts";

Deno.test("chat languages reach X resolution and the final rich caption", async () => {
	const originalFetch = globalThis.fetch;
	const id = "1234567890";
	const url = `https://x.com/i/status/${id}`;
	try {
		for (const [languages, expected, targets] of [
			[["en", "ru"], "Привет", []],
			[["de"], "Hello", ["de", "en"]],
			[["en"], "Hello", ["en"]],
		] as [string[], string, string[]][]) {
			const requests: string[] = [];
			globalThis.fetch = (input) => {
				const target = String(input);
				if (target.includes("syndication"))
					return Promise.resolve(
						Response.json({ id_str: id, lang: "ru", text: "Привет" }),
					);
				const language = target.split("/").at(-1) ?? "";
				requests.push(language);
				return Promise.resolve(
					Response.json({
						code: 200,
						tweet: {
							id,
							lang: "ru",
							translation:
								language === "en"
									? { text: "Hello", target_lang: "en", source_lang: "ru" }
									: null,
						},
					}),
				);
			};
			const sent: InputRichMessage[] = [];
			const ctx = {
				from: { id: 42, first_name: "Tester" },
				objects: { chat: { settings: { ...DEFAULT_SETTINGS, languages } } },
				telemetry: { event() {} },
				i18n: { t: () => "Sender" },
				replyWithRichMessage: (message: InputRichMessage) => {
					sent.push(message);
					return {};
				},
			} as unknown as CustomContext;
			assertEquals(await downloadMatchedUrl(ctx, url), true);
			assertStringIncludes(sent[0].html ?? "", expected);
			assertEquals(requests, targets);
		}
	} finally {
		globalThis.fetch = originalFetch;
	}
});
