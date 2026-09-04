import { escapeHtml } from "./html.ts";

type MarkdownLink = {
	end: number;
	label: string;
	url: string;
};

// Post bodies arrive as plain text, but some providers leave Markdown links in
// them. Convert only web links and escape everything else before the result is
// embedded in Telegram HTML.
export function renderMarkdownLinks(value: string | number): string {
	const text = String(value);
	let html = "";
	let cursor = 0;
	let searchFrom = 0;

	while (searchFrom < text.length) {
		const start = text.indexOf("[", searchFrom);
		if (start === -1) {
			break;
		}

		const link = isEscaped(text, start) ? null : parseMarkdownLink(text, start);
		if (!link) {
			searchFrom = start + 1;
			continue;
		}

		html += escapeHtml(text.slice(cursor, start));
		html += `<a href="${escapeHtml(link.url)}">${escapeHtml(link.label)}</a>`;
		cursor = link.end;
		searchFrom = link.end;
	}

	return html + escapeHtml(text.slice(cursor));
}

function parseMarkdownLink(text: string, start: number): MarkdownLink | null {
	const labelEnd = findLabelEnd(text, start + 1);
	if (labelEnd === -1 || text[labelEnd + 1] !== "(") {
		return null;
	}

	const destination = findDestinationEnd(text, labelEnd + 2);
	if (!destination) {
		return null;
	}

	const label = unescapeMarkdown(text.slice(start + 1, labelEnd));
	const url = unescapeMarkdown(
		text.slice(labelEnd + 2, destination.end).trim(),
	);
	if (!label || !isWebUrl(url)) {
		return null;
	}

	return { end: destination.closingParen + 1, label, url };
}

function findLabelEnd(text: string, start: number) {
	let nestedBrackets = 0;
	for (let index = start; index < text.length; index++) {
		const character = text[index];
		if (character === "\n" || character === "\r") {
			return -1;
		}
		if (character === "\\") {
			index++;
			continue;
		}
		if (character === "[") {
			nestedBrackets++;
			continue;
		}
		if (character === "]") {
			if (nestedBrackets === 0) {
				return index;
			}
			nestedBrackets--;
		}
	}
	return -1;
}

function findDestinationEnd(
	text: string,
	start: number,
): { end: number; closingParen: number } | null {
	let nestedParentheses = 0;
	for (let index = start; index < text.length; index++) {
		const character = text[index];
		if (character === "\n" || character === "\r" || /\s/.test(character)) {
			return null;
		}
		if (character === "\\") {
			index++;
			continue;
		}
		if (character === "(") {
			nestedParentheses++;
			continue;
		}
		if (character === ")") {
			if (nestedParentheses === 0) {
				return { end: index, closingParen: index };
			}
			nestedParentheses--;
		}
	}
	return null;
}

function isEscaped(text: string, index: number) {
	let backslashes = 0;
	for (let cursor = index - 1; cursor >= 0 && text[cursor] === "\\"; cursor--) {
		backslashes++;
	}
	return backslashes % 2 === 1;
}

function unescapeMarkdown(value: string) {
	return value.replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/g, "$1");
}

function isWebUrl(value: string) {
	try {
		const url = new URL(value);
		return url.protocol === "http:" || url.protocol === "https:";
	} catch {
		return false;
	}
}
