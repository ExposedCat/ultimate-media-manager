import { deletePaths } from "../helpers/fs.ts";
import type { CustomContext } from "../types/context.ts";
import { type DownloadedMedia, downloadMediaForUrl } from "./download-media.ts";
import type { SourceType } from "./sources.ts";

export type DownloadResponse = {
	cleanup: () => Promise<unknown>;
	getTempDir: () => Promise<string>;
	media: DownloadedMedia | null;
	previewUrl: string;
	text: string;
};

type DownloadResponseData = {
	sourceType: SourceType;
	userId: number;
	userName: string;
	url: string;
	fallbackUrl?: string;
};

type DownloadResponseMediaKind = NonNullable<DownloadResponse["media"]>["kind"];

export function buildLinkPreviewOptions(url: string) {
	return {
		is_disabled: false,
		url,
		prefer_large_media: true,
		show_above_text: true,
	};
}

function getPromoText(
	ctx: CustomContext,
	data: DownloadResponseData,
	kind: string,
) {
	return ctx.i18n.t("promoCaption", {
		viewUrl: ctx.i18n.t(`viewOn.${data.sourceType}`, {
			kind,
			postUrl: data.url,
			userName: data.userName,
			userId: data.userId,
		}),
	});
}

export function buildDownloadResponseText(
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
			title: title ?? "Downloaded Video",
			url: data.url,
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

	let tempDir: string | null = null;
	const getTempDir = async () => {
		tempDir ??= await Deno.makeTempDir({
			prefix: `ummrobot-${data.userId}-`,
		});
		return tempDir;
	};
	const cleanup = async () => await deletePaths(tempDir ? [tempDir] : []);
	const previewUrl = data.fallbackUrl ?? data.url;
	const media = await downloadMediaForUrl(data.url);

	if (!media) {
		return {
			cleanup,
			getTempDir,
			media: null,
			previewUrl,
			text: buildDownloadResponseText(ctx, data, null),
		};
	}

	if (data.sourceType === "youtubeVideo") {
		const title =
			media.kind === "images"
				? "Downloaded Video"
				: (media.title ?? "Downloaded Video");
		return {
			cleanup,
			getTempDir,
			media,
			previewUrl,
			text: buildDownloadResponseText(ctx, data, media.kind, title),
		};
	}

	return {
		cleanup,
		getTempDir,
		media,
		previewUrl,
		text: buildDownloadResponseText(ctx, data, media.kind),
	};
}
