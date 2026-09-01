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
const VERIFIED_EMOJI = '<tg-emoji emoji-id="5951665890079544884">✅</tg-emoji>';
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
const VERIFIED_AUTHOR_SOURCES = new Set<SourceType>([
	"instagram",
	"tiktok",
	"twitter",
]);
const TRAILING_TCO_URL = /(?:^|\s)https:\/\/t\.co\/[^\s]+\s*$/i;

export function stripTrailingTcoUrl(value: string) {
	return value.replace(TRAILING_TCO_URL, "").trim();
}

export function buildRichMessage(
	data: RichMessageData<string>,
): InputRichMessageWithoutUpload;
export function buildRichMessage(data: RichMessageData): InputRichMessage;
export function buildRichMessage(data: RichMessageData): InputRichMessage {
	const { html: mediaHtml, media } = buildMedia(data.media);
	return {
		html: buildRichHtml(data, mediaHtml),
		...(media.length > 0 && { media }),
	};
}

function buildRichHtml(data: RichMessageData, mediaHtml: string) {
	const { baseHtml, captionEnabled, metadata, sourceType } = data;
	if (!captionEnabled || !metadata) {
		return joinBlocks(mediaHtml, paragraph(baseHtml));
	}

	if (sourceType === "reddit") {
		return buildRedditHtml(metadata, mediaHtml, baseHtml);
	}

	if (sourceType === "twitter") {
		return buildTwitterHtml(metadata, mediaHtml, baseHtml, sourceType);
	}

	return joinBlocks(
		mediaHtml,
		metadataQuote(metadata, sourceType),
		paragraph(baseHtml),
	);
}

function buildRedditHtml(
	meta: PostCaptionMeta,
	mediaHtml: string,
	baseHtml: string,
) {
	if (!meta.title) {
		return joinBlocks(mediaHtml, paragraph(baseHtml));
	}

	const author = buildRedditCredit(meta);
	const content = meta.text ? truncate(meta.text, MAX_RICH_TEXT_LENGTH) : "";
	const quote = buildQuote(content, author);
	return joinBlocks(
		`<h5>${escapeHtml(truncate(meta.title, MAX_TITLE_LENGTH))}</h5>`,
		mediaHtml,
		quote,
	);
}

function buildRedditCredit(meta: PostCaptionMeta) {
	const identity = [REDDIT_EMOJI];
	if (meta.subreddit) {
		const subreddit = escapeHtml(meta.subreddit);
		identity.push(
			`<a href="https://www.reddit.com/r/${subreddit}">r/${subreddit}</a>`,
		);
	}
	if (meta.authorHandle) {
		identity.push(
			`${meta.subreddit ? "· " : ""}u/${escapeHtml(meta.authorHandle)}`,
		);
	}

	const stats = [];
	if (meta.likeCount !== undefined) {
		stats.push(`${UPVOTE_EMOJI} ${formatCount(meta.likeCount)}`);
	}
	if (meta.commentCount !== undefined) {
		stats.push(`${COMMENT_EMOJI} ${formatCount(meta.commentCount)}`);
	}
	return `${identity.join(" ")}${stats.length > 0 ? `<br>${stats.join(" ")}` : ""}`;
}

function buildTwitterHtml(
	meta: PostCaptionMeta,
	mediaHtml: string,
	baseHtml: string,
	sourceType: SourceType,
) {
	const text = meta.text ? stripTrailingTcoUrl(meta.text) : "";
	return joinBlocks(
		mediaHtml,
		buildQuote(text, buildPlatformCredit(sourceType, meta)),
		paragraph(baseHtml),
	);
}

function metadataQuote(meta: PostCaptionMeta, sourceType: SourceType) {
	const content =
		sourceType === "soundcloud"
			? (meta.title ?? meta.text ?? "")
			: (meta.text ?? meta.title ?? "");
	return buildQuote(content, buildPlatformCredit(sourceType, meta));
}

function buildPlatformCredit(sourceType: SourceType, meta: PostCaptionMeta) {
	const name = meta.authorName ?? meta.authorHandle;
	if (!name) {
		return "";
	}
	return [
		PLATFORM_EMOJI[sourceType],
		escapeHtml(name),
		meta.authorVerified && VERIFIED_AUTHOR_SOURCES.has(sourceType)
			? VERIFIED_EMOJI
			: "",
	]
		.filter(Boolean)
		.join(" ");
}

function buildQuote(content: string, authorHtml = "") {
	const trimmed = content.trim();
	if (!trimmed && !authorHtml) {
		return "";
	}
	if (!trimmed) {
		return `<blockquote expandable>${authorHtml}</blockquote>`;
	}
	const body = escapeHtml(truncate(trimmed, MAX_RICH_TEXT_LENGTH));
	const cite = authorHtml ? `<cite>${authorHtml}</cite>` : "";
	return `<blockquote expandable>${body}${cite}</blockquote>`;
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
			},
		};
	});
	const tags = items.map((item, index) => {
		const scheme = item.kind === "image" ? "photo" : item.kind;
		const tag = item.kind === "image" ? "img" : item.kind;
		return `<${tag} src="tg://${scheme}?id=media_${index}"/>`;
	});

	return {
		html:
			tags.length > 1
				? `<tg-slideshow>${tags.join("")}</tg-slideshow>`
				: (tags[0] ?? ""),
		media,
	};
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
