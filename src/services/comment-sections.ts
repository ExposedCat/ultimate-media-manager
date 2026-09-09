/** Group whole comments, retaining at most ten sections in source order. */
export function commentSections<T>(
	comments: T[],
	describe: (comment: T) => { text?: string; mediaCount?: number },
): T[][] {
	const sections: T[][] = [];
	let length = 0;
	let sealed = false;
	for (const comment of comments) {
		const info = describe(comment);
		const size = Array.from(info.text ?? "").length;
		const hasMedia = (info.mediaCount ?? 0) > 0;
		if (!sections.length || sealed || hasMedia || length + size > 750) {
			if (sections.length === 10) break;
			sections.push([]);
			length = 0;
		}
		sections[sections.length - 1].push(comment);
		length += size;
		sealed = hasMedia || length > 750;
	}
	return sections;
}
