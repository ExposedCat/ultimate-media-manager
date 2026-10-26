import { escapeHtml } from "../helpers/html.ts";
import type { CustomContext } from "../types/context.ts";
import {
	type PostCaptionMeta,
	buildPostCaption,
	captionEnabled,
} from "./caption.ts";
import { type DownloadedMedia, downloadMediaForUrl } from "./download-media.ts";
import type { CachedMedia } from "./media-file-cache.ts";
import { buildSenderCredit } from "./rich-message.ts";
import { getResponseSettings, responseSlideshowDelay } from "./slideshow.ts";
import type { SourceType } from "./sources.ts";

export type DownloadResponse = {
	baseText: string;
	baseTextWithoutComments?: string;
	captionEnabled: boolean;
	media: DownloadedMedia | null;
	sourceType: SourceType;
	text: string;
	error?: string;
	reason?: string;
	metadata?: PostCaptionMeta;
};

type DownloadResponseData = {
	comments?: number;
	sourceType: SourceType;
	userId: number;
	userName: string;
	url: string;
	fallbackUrl?: string;
};

type DownloadResponseMediaKind = NonNullable<DownloadResponse["media"]>["kind"];

export function responseMediaKind(
	sourceType: SourceType,
	media: DownloadedMedia | CachedMedia,
): DownloadResponseMediaKind | null {
	const count = media.metadata?.mediaCount;
	if (
		(sourceType !== "twitter" && sourceType !== "reddit") ||
		count === undefined
	) {
		return media.kind;
	}
	if (count === 0) {
		return null;
	}
	if (count > 1) {
		return "images";
	}
	// Postfetch orders the main post's media before media from quoted posts.
	return media.kind === "images"
		? (("files" in media ? media.files : media.items)[0]?.kind ?? null)
		: media.kind;
}

export function responseCaptionEnabled(
	ctx: CustomContext,
	sourceType: SourceType,
) {
	return captionEnabled(getResponseSettings(ctx), sourceType);
}

function captionPostUrl(data: DownloadResponseData): string {
	if (data.sourceType !== "instagram") {
		return data.url;
	}
	try {
		const url = new URL(data.url);
		if (!url.searchParams.has("rpxt")) {
			return data.url;
		}
		url.searchParams.delete("rpxt");
		return url.href;
	} catch {
		return data.url;
	}
}

function getPromoText(
	ctx: CustomContext,
	data: DownloadResponseData,
	kind: string,
	meta?: PostCaptionMeta | null,
) {
	const text = ctx.i18n.t("promoCaption", {
		viewUrl: ctx.i18n.t(`viewOn.${data.sourceType}`, {
			kind: `${kind}${data.sourceType === "twitter" && meta?.isComment ? " comment" : ""}${meta?.comments?.length ? " with comments" : ""}`,
			postUrl: escapeHtml(captionPostUrl(data)),
			userName: escapeHtml(data.userName),
			userId: data.userId,
		}),
	});
	return data.sourceType === "spotify" && meta?.youtubeUrl
		? `${text} ${ctx.i18n.t(meta.youtubeLiveFallback ? "songSourceLive" : "songSource", { url: escapeHtml(meta.youtubeUrl) })}`
		: text;
}

export function buildDownloadResponseText(
	ctx: CustomContext,
	data: DownloadResponseData,
	mediaKind: DownloadResponseMediaKind | null,
	title?: string,
	meta?: PostCaptionMeta | null,
) {
	const base = buildSenderCredit(
		data.sourceType,
		buildDownloadResponseBaseText(ctx, data, mediaKind, title, meta),
	);
	if (!meta || !responseCaptionEnabled(ctx, data.sourceType)) {
		return base;
	}
	const quote = buildPostCaption(data.sourceType, meta);
	return quote ? `${quote}\n${base}` : base;
}

export function buildDownloadResponseBaseText(
	ctx: CustomContext,
	data: DownloadResponseData,
	mediaKind: DownloadResponseMediaKind | null,
	_title?: string,
	meta?: PostCaptionMeta | null,
) {
	if (!mediaKind) {
		return data.sourceType === "youtubeVideo"
			? ctx.i18n.t("error.video")
			: getPromoText(ctx, data, "post", meta);
	}

	if (data.sourceType === "spotify" || data.sourceType === "youtubeMusic") {
		return getPromoText(ctx, data, "song", meta);
	}

	// The "youtube" source matches /shorts/ links; regular links use "youtubeVideo".
	if (data.sourceType === "youtube" && mediaKind === "video") {
		return getPromoText(ctx, data, "short", meta);
	}

	const kind =
		mediaKind === "images"
			? "slider"
			: mediaKind === "audio"
				? "audio"
				: mediaKind === "image"
					? "image"
					: "video";

	return getPromoText(ctx, data, kind, meta);
}

export async function buildDownloadResponse(
	ctx: CustomContext,
	data: DownloadResponseData,
): Promise<DownloadResponse> {
	console.info("[DownloadResponse] Building response", {
		sourceType: data.sourceType,
		url: data.url,
		userId: data.userId,
	});

	const { media, error, reason, metadata } = await downloadMediaForUrl(
		data.url,
		{ slideshowDelay: responseSlideshowDelay(ctx), comments: data.comments },
	);

	if (!media) {
		const baseText = buildDownloadResponseBaseText(
			ctx,
			data,
			null,
			undefined,
			metadata,
		);
		const captionsEnabled = responseCaptionEnabled(ctx, data.sourceType);
		return {
			baseText,
			baseTextWithoutComments: buildDownloadResponseBaseText(
				ctx,
				data,
				null,
				undefined,
				{ ...metadata, comments: [] },
			),
			captionEnabled: captionsEnabled,
			media: null,
			sourceType: data.sourceType,
			text: buildDownloadResponseText(ctx, data, null, undefined, metadata),
			error,
			reason,
			metadata,
		};
	}

	const attributionKind = responseMediaKind(data.sourceType, media);
	const baseText = buildDownloadResponseBaseText(
		ctx,
		data,
		attributionKind,
		undefined,
		media.metadata,
	);
	return {
		baseText,
		baseTextWithoutComments: buildDownloadResponseBaseText(
			ctx,
			data,
			attributionKind,
			undefined,
			{ ...media.metadata, comments: [] },
		),
		captionEnabled: responseCaptionEnabled(ctx, data.sourceType),
		media,
		metadata: media.metadata,
		sourceType: data.sourceType,
		text: buildDownloadResponseText(
			ctx,
			data,
			attributionKind,
			undefined,
			media.metadata,
		),
	};
}
