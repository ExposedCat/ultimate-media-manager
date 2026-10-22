// Telegram rejects strings containing lone UTF-16 surrogates, so never cut a
// surrogate pair in half when shortening text to a UTF-16 length limit.
export function sliceUtf16(text: string, max: number): string {
	if (text.length <= max) return text;
	const end =
		max > 0 && isHighSurrogate(text.charCodeAt(max - 1)) ? max - 1 : max;
	return text.slice(0, Math.max(end, 0));
}

export function truncateText(text: string, max: number): string {
	const trimmed = text.trim();
	return trimmed.length > max
		? `${sliceUtf16(trimmed, max - 1).trimEnd()}…`
		: trimmed;
}

function isHighSurrogate(code: number) {
	return code >= 0xd800 && code <= 0xdbff;
}
