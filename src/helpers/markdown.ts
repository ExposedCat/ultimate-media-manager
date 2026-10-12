import { Lexer, type Token } from "marked";

import { escapeHtml } from "./html.ts";

// Render only Telegram-supported formatting; retain other Markdown as text.
export function renderMarkdown(value: string | number): string {
	return Lexer.lex(String(value), { gfm: false })
		.map((token) => {
			if (token.type === "code" && /^ {0,3}(`{3,}|~{3,})/.test(token.raw)) {
				return `<pre>${escapeHtml(token.text)}</pre>${token.raw.endsWith("\n") ? "\n" : ""}`;
			}
			return renderInline(token.raw);
		})
		.join("");
}

function renderInline(text: string): string {
	return Lexer.lexInline(text, { gfm: false }).map(renderToken).join("");
}

function renderToken(token: Token): string {
	switch (token.type) {
		case "strong":
			return `<b>${(token.tokens ?? []).map(renderToken).join("")}</b>`;
		case "em":
			return `<i>${(token.tokens ?? []).map(renderToken).join("")}</i>`;
		case "codespan":
			return `<code>${escapeHtml(token.text)}</code>`;
		case "link":
			if (isWebUrl(token.href)) {
				return `<a href="${escapeHtml(token.href)}">${(token.tokens ?? []).map(renderToken).join("")}</a>`;
			}
			return escapeHtml(token.raw);
		case "escape":
			return escapeHtml(token.text);
		default:
			return escapeHtml(token.raw);
	}
}

function isWebUrl(value: string): boolean {
	try {
		const url = new URL(value);
		return url.protocol === "http:" || url.protocol === "https:";
	} catch {
		return false;
	}
}
