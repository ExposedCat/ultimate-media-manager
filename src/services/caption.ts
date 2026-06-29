import { escapeHtml } from "../helpers/html.ts";
import type { Settings } from "../types/database.ts";
import type { SourceType } from "./sources.ts";

// Normalized, transport-agnostic subset of postfetch metadata that the caption
// renderer needs. Mapped from the library result at the resolver boundary so the
// library's own types never leak deeper into the bot.
export type PostCaptionMeta = {
	title?: string;
	text?: string;
	authorHandle?: string;
	authorName?: string;
	likeCount?: number;
	commentCount?: number;
	subreddit?: string;
};

export type CaptionSetting = Extract<keyof Settings, `caption${string}`>;

// Which chat setting toggles the caption for each source. Facebook has no
// structured metadata, so it has no caption toggle.
export const CAPTION_SETTING: Partial<Record<SourceType, CaptionSetting>> = {
	reddit: "captionReddit",
	soundcloud: "captionSoundcloud",
	instagram: "captionInstagram",
	tiktok: "captionTiktok",
	twitter: "captionTwitter",
	pinterest: "captionPinterest",
	youtube: "captionYoutube",
	youtubeVideo: "captionYoutube",
};

const MAX_TITLE_LENGTH = 256;
// Telegram caption hard limit (visible characters); the rest of the budget is
// reserved for the attribution line, facts, emoji fallbacks and newlines.
const CAPTION_LIMIT = 1024;
const RESERVE = 128;

// Telegram custom emoji; the inner glyph is the fallback shown to non-premium users.
const UPVOTE_EMOJI = '<tg-emoji emoji-id="5875078273775439450">🔼</tg-emoji>';
const COMMENT_EMOJI = '<tg-emoji emoji-id="5994297722574737553">💬</tg-emoji>';

export function captionEnabled(settings: Settings, sourceType: SourceType) {
	const setting = CAPTION_SETTING[sourceType];
	return setting ? settings[setting] : false;
}

// Renders an expandable Telegram blockquote that goes above the attribution line.
// Reddit and SoundCloud get a structured header (title + facts); everyone else
// quotes the post text (caption/tweet/description). Returns null when there is
// nothing worth showing.
export function buildPostCaption(
	sourceType: SourceType,
	meta: PostCaptionMeta,
): string | null {
	const body =
		sourceType === "reddit"
			? redditBody(meta)
			: sourceType === "soundcloud"
				? soundcloudBody(meta)
				: textBody(meta);
	return body ? `<blockquote expandable>${body}</blockquote>` : null;
}

function redditBody(meta: PostCaptionMeta): string | null {
	if (!meta.title) {
		return null;
	}
	const facts: string[] = [];
	if (meta.subreddit) {
		const sub = escapeHtml(meta.subreddit);
		facts.push(`<a href="https://www.reddit.com/r/${sub}">r/${sub}</a>`);
	}
	if (meta.likeCount !== undefined) {
		facts.push(`${UPVOTE_EMOJI} ${formatCount(meta.likeCount)}`);
	}
	if (meta.commentCount !== undefined) {
		facts.push(`${COMMENT_EMOJI} ${formatCount(meta.commentCount)}`);
	}
	const title = truncate(meta.title, MAX_TITLE_LENGTH);
	const head = [`<b>${escapeHtml(title)}</b>`, facts.join(" ")]
		.filter(Boolean)
		.join("\n");
	const budget = CAPTION_LIMIT - RESERVE - title.length;
	if (!meta.text || budget <= 0) {
		return head;
	}
	return `${head}\n\n${escapeHtml(truncate(meta.text, budget))}`;
}

function soundcloudBody(meta: PostCaptionMeta): string | null {
	if (!meta.title) {
		return null;
	}
	const head = `<b>${escapeHtml(truncate(meta.title, MAX_TITLE_LENGTH))}</b>`;
	const artist = meta.authorName ?? meta.authorHandle;
	return artist ? `${head} — ${escapeHtml(artist)}` : head;
}

function textBody(meta: PostCaptionMeta): string | null {
	return meta.text
		? escapeHtml(truncate(meta.text, CAPTION_LIMIT - RESERVE))
		: null;
}

function truncate(text: string, max: number): string {
	const trimmed = text.trim();
	return trimmed.length > max
		? `${trimmed.slice(0, max - 1).trimEnd()}…`
		: trimmed;
}

function formatCount(value: number): string {
	return value.toLocaleString("en-US");
}
