import { escapeHtml } from "../helpers/html.ts";
import type { CustomContext } from "../types/context.ts";
import {
	type PostCaptionMeta,
	buildPostCaption,
	captionEnabled,
} from "./caption.ts";
import { DEFAULT_SETTINGS } from "./chat.ts";
import { type DownloadedMedia, downloadMediaForUrl } from "./download-media.ts";
import type { SourceType } from "./sources.ts";

export type DownloadResponse = {
	baseText: string;
	captionEnabled: boolean;
	media: DownloadedMedia | null;
	sourceType: SourceType;
	text: string;
	error?: string;
	reason?: string;
	metadata?: PostCaptionMeta;
};

type DownloadResponseData = {
	sourceType: SourceType;
	userId: number;
	userName: string;
	url: string;
	fallbackUrl?: string;
};

type DownloadResponseMediaKind = NonNullable<DownloadResponse["media"]>["kind"];

function getResponseSettings(ctx: CustomContext) {
	if (ctx.guestMessage && ctx.chat?.type === "private") {
		return (
			ctx.objects?.guestReceiverUser?.settings ??
			ctx.objects?.guestSenderUser?.settings ??
			DEFAULT_SETTINGS
		);
	}

	return (
		ctx.objects?.chat?.settings ??
		ctx.objects?.user?.settings ??
		DEFAULT_SETTINGS
	);
}

export function responseCaptionEnabled(
	ctx: CustomContext,
	sourceType: SourceType,
) {
	return captionEnabled(getResponseSettings(ctx), sourceType);
}

function getPromoText(
	ctx: CustomContext,
	data: DownloadResponseData,
	kind: string,
) {
	return ctx.i18n.t("promoCaption", {
		viewUrl: ctx.i18n.t(`viewOn.${data.sourceType}`, {
			kind,
			postUrl: escapeHtml(data.url),
			userName: escapeHtml(data.userName),
			userId: data.userId,
		}),
	});
}

export function buildDownloadResponseText(
	ctx: CustomContext,
	data: DownloadResponseData,
	mediaKind: DownloadResponseMediaKind | null,
	title?: string,
	meta?: PostCaptionMeta | null,
) {
	const base = buildDownloadResponseBaseText(ctx, data, mediaKind, title);
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
	title?: string,
) {
	if (!mediaKind) {
		return data.sourceType === "youtubeVideo"
			? ctx.i18n.t("error.video")
			: getPromoText(ctx, data, "post");
	}

	if (data.sourceType === "youtubeVideo") {
		const resourceKey =
			mediaKind === "audio" ? "downloaded.audio" : "downloaded.video";
		return ctx.i18n.t(resourceKey, {
			title: escapeHtml(title ?? "Downloaded Video"),
			url: escapeHtml(data.url),
		});
	}

	const kind =
		mediaKind === "images"
			? "slider"
			: mediaKind === "audio"
				? "audio"
				: mediaKind === "image"
					? "image"
					: "video";

	return getPromoText(ctx, data, kind);
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
	);

	if (!media) {
		const baseText = buildDownloadResponseBaseText(ctx, data, null);
		const captionsEnabled = responseCaptionEnabled(ctx, data.sourceType);
		return {
			baseText,
			captionEnabled: captionsEnabled,
			media: null,
			sourceType: data.sourceType,
			text: buildDownloadResponseText(ctx, data, null, undefined, metadata),
			error,
			reason,
			metadata,
		};
	}

	if (data.sourceType === "youtubeVideo") {
		const title =
			media.kind === "images"
				? "Downloaded Video"
				: (media.title ?? "Downloaded Video");
		const baseText = buildDownloadResponseBaseText(
			ctx,
			data,
			media.kind,
			title,
		);
		return {
			baseText,
			captionEnabled: responseCaptionEnabled(ctx, data.sourceType),
			media,
			metadata: media.metadata,
			sourceType: data.sourceType,
			text: buildDownloadResponseText(
				ctx,
				data,
				media.kind,
				title,
				media.metadata,
			),
		};
	}

	const baseText = buildDownloadResponseBaseText(ctx, data, media.kind);
	return {
		baseText,
		captionEnabled: responseCaptionEnabled(ctx, data.sourceType),
		media,
		metadata: media.metadata,
		sourceType: data.sourceType,
		text: buildDownloadResponseText(
			ctx,
			data,
			media.kind,
			undefined,
			media.metadata,
		),
	};
}
