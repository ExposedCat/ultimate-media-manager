import type { InputFile } from "grammy";
import type {
	InputRichMessage,
	InputRichMessageWithoutUpload,
} from "grammy/types";

import { escapeHtml } from "../helpers/html.ts";
import type { PostCaptionMeta } from "./caption.ts";
import type { SourceType } from "./sources.ts";

export type RichMediaKind = "image" | "video" | "audio";
export type RichMediaItem<T = string | InputFile> = {
	kind: RichMediaKind;
	media: T;
};

export type RichMessageData<T = string | InputFile> = {
	baseHtml: string;
	captionEnabled: boolean;
	media: RichMediaItem<T>[];
	metadata?: PostCaptionMeta | null;
	sourceType: SourceType;
};

const MAX_RICH_TEXT_LENGTH = 30_000;
const MAX_TITLE_LENGTH = 256;
const REDDIT_EMOJI = '<tg-emoji emoji-id="5343641195484560502">👽</tg-emoji>';
const UPVOTE_EMOJI = '<tg-emoji emoji-id="5875078273775439450">🔼</tg-emoji>';
const COMMENT_EMOJI = '<tg-emoji emoji-id="5994297722574737553">💬</tg-emoji>';
const PLATFORM_EMOJI: Record<SourceType, string> = {
	facebook: '<tg-emoji emoji-id="5454340696183943190">📘</tg-emoji>',
	instagram: '<tg-emoji emoji-id="5454400924510334242">📸</tg-emoji>',
	linkedin: '<tg-emoji emoji-id="5454158271743012602">💼</tg-emoji>',
	pinterest: '<tg-emoji emoji-id="5467420297529401124">📌</tg-emoji>',
	reddit: REDDIT_EMOJI,
	soundcloud: '<tg-emoji emoji-id="5454046508104035795">☁️</tg-emoji>',
	tiktok: '<tg-emoji emoji-id="5454351124364542651">🎵</tg-emoji>',
	twitter: '<tg-emoji emoji-id="5334651953488080684">🐦</tg-emoji>',
	youtube: '<tg-emoji emoji-id="5454010052421626926">▶️</tg-emoji>',
	youtubeVideo: '<tg-emoji emoji-id="5454010052421626926">▶️</tg-emoji>',
};
const TRAILING_TCO_URL = /(?:^|\s)https:\/\/t\.co\/[^\s]+\s*$/i;

export function stripTrailingTcoUrl(value: string) {
	return value.replace(TRAILING_TCO_URL, "").trim();
}

export function buildRichMessage(
	data: RichMessageData<string>,
): InputRichMessageWithoutUpload;
export function buildRichMessage(data: RichMessageData): InputRichMessage;
export function buildRichMessage(data: RichMessageData): InputRichMessage {
	const { tags: mediaTags, media } = buildMedia(data.media);
	return {
		html: buildRichHtml(data, mediaTags),
		...(media.length > 0 && { media }),
	};
}

function buildRichHtml(data: RichMessageData, mediaTags: string[]) {
	const { baseHtml, captionEnabled, metadata, sourceType } = data;
	const senderCredit = buildSenderCredit(sourceType, baseHtml);
	const mediaHtml = mediaBlock(mediaTags);
	if (!captionEnabled || !metadata) {
		return joinBlocks(mediaHtml, paragraph(senderCredit));
	}

	if (sourceType === "reddit") {
		return buildRedditHtml(metadata, mediaHtml, senderCredit);
	}

	if (sourceType === "twitter") {
		return buildTwitterHtml(metadata, mediaTags, senderCredit);
	}

	return joinBlocks(
		mediaHtml,
		metadataQuote(metadata, sourceType, senderCredit),
	);
}

function buildRedditHtml(
	meta: PostCaptionMeta,
	mediaHtml: string,
	senderCredit: string,
) {
	const content = meta.text ? truncate(meta.text, MAX_RICH_TEXT_LENGTH) : "";
	const facts = buildRedditFacts(meta);
	return joinBlocks(
		meta.title
			? `<h5>${escapeHtml(truncate(meta.title, MAX_TITLE_LENGTH))}</h5>`
			: "",
		mediaHtml,
		buildQuote(content),
		paragraph(facts),
		paragraph(senderCredit),
	);
}

function buildRedditFacts(meta: PostCaptionMeta) {
	const facts = [];
	if (meta.subreddit) {
		const subreddit = escapeHtml(meta.subreddit);
		facts.push(
			`<a href="https://www.reddit.com/r/${subreddit}">r/${subreddit}</a>`,
		);
	}
	if (meta.likeCount !== undefined) {
		facts.push(`${UPVOTE_EMOJI} ${formatCount(meta.likeCount)}`);
	}
	if (meta.commentCount !== undefined) {
		facts.push(`${COMMENT_EMOJI} ${formatCount(meta.commentCount)}`);
	}
	return facts.join(" ");
}

function buildTwitterHtml(
	meta: PostCaptionMeta,
	mediaTags: string[],
	senderCredit: string,
) {
	const assignedMediaCount =
		meta.mediaCount === undefined ? mediaTags.length : twitterMediaCount(meta);
	const rootMediaCount =
		(meta.mediaCount ?? mediaTags.length) +
		Math.max(0, mediaTags.length - assignedMediaCount);
	const { html } = buildTwitterPost(meta, mediaTags, 0, rootMediaCount, false);
	return joinBlocks(html, paragraph(senderCredit));
}

function buildTwitterPost(
	meta: PostCaptionMeta,
	mediaTags: string[],
	start: number,
	mediaCount = meta.mediaCount ?? 0,
	quoted = true,
): { html: string; next: number } {
	const ownMedia = mediaBlock(mediaTags.slice(start, start + mediaCount));
	let next = start + mediaCount;
	let quotedHtml = "";
	if (meta.quotedPost) {
		const quoted = buildTwitterPost(meta.quotedPost, mediaTags, next);
		quotedHtml = quoted.html;
		next = quoted.next;
	}

	const text = meta.text ? stripTrailingTcoUrl(meta.text) : "";
	const author = twitterAuthor(meta);
	const heading = author
		? `${author}:${text ? ` ${escapeHtml(truncate(text, MAX_RICH_TEXT_LENGTH))}` : ""}`
		: text
			? escapeHtml(truncate(text, MAX_RICH_TEXT_LENGTH))
			: "";
	const blocks = [
		heading ? paragraph(heading) : "",
		ownMedia,
		quotedHtml,
	].filter(Boolean);

	return {
		html:
			blocks.length > 0
				? quoted
					? `<blockquote>\n${blocks.join("\n")}\n</blockquote>`
					: blocks.join("\n")
				: "",
		next,
	};
}

function twitterAuthor(meta: PostCaptionMeta) {
	const name = meta.authorName?.trim();
	const handle = meta.authorHandle?.replace(/^@/, "").trim();
	const label = name ?? handle;
	if (!label) {
		return "";
	}
	const nameHtml = `<b>${escapeHtml(label)}</b>`;
	return handle
		? `<a href="https://x.com/${encodeURIComponent(handle)}">${nameHtml}</a>`
		: nameHtml;
}

function twitterMediaCount(meta: PostCaptionMeta): number {
	return (
		(meta.mediaCount ?? 0) +
		(meta.quotedPost ? twitterMediaCount(meta.quotedPost) : 0)
	);
}

function metadataQuote(
	meta: PostCaptionMeta,
	sourceType: SourceType,
	senderCredit: string,
) {
	const content =
		sourceType === "soundcloud"
			? (meta.title ?? meta.text ?? "")
			: (meta.text ?? meta.title ?? "");
	return buildQuote(content, senderCredit);
}

export function buildSenderCredit(sourceType: SourceType, baseHtml: string) {
	if (!baseHtml) {
		return "";
	}
	return `${PLATFORM_EMOJI[sourceType]} ${baseHtml}`;
}

function buildQuote(content: string, creditHtml = "") {
	const trimmed = content.trim();
	if (!trimmed && !creditHtml) {
		return "";
	}
	if (!trimmed) {
		return paragraph(creditHtml);
	}
	const body = escapeHtml(truncate(trimmed, MAX_RICH_TEXT_LENGTH));
	return joinBlocks(
		`<blockquote expandable>${body}</blockquote>`,
		paragraph(creditHtml),
	);
}

function paragraph(html: string) {
	return html ? `<p>${html}</p>` : "";
}

function joinBlocks(...blocks: string[]) {
	return blocks.filter(Boolean).join("\n");
}

function buildMedia(items: RichMediaItem[]) {
	const media = items.map((item, index) => {
		const id = `media_${index}`;
		return {
			id,
			media: {
				type:
					item.kind === "image"
						? ("photo" as const)
						: item.kind === "audio"
							? ("audio" as const)
							: ("video" as const),
				media: item.media,
				...(item.kind === "video" && { supports_streaming: true }),
			},
		};
	});
	const tags = items.map((item, index) => {
		const scheme = item.kind === "image" ? "photo" : item.kind;
		const tag = item.kind === "image" ? "img" : item.kind;
		return `<${tag} src="tg://${scheme}?id=media_${index}"/>`;
	});

	return { tags, media };
}

function mediaBlock(tags: string[]) {
	return tags.length > 1
		? `<tg-slideshow>${tags.join("")}</tg-slideshow>`
		: (tags[0] ?? "");
}

function truncate(text: string, max: number) {
	const trimmed = text.trim();
	return trimmed.length > max
		? `${trimmed.slice(0, max - 1).trimEnd()}…`
		: trimmed;
}

function formatCount(value: number) {
	return value.toLocaleString("en-US");
}
