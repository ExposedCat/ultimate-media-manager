import { deletePaths } from "../helpers/fs.ts";
import type { CustomContext } from "../types/context.ts";
import { type DownloadedMedia, downloadMediaForUrl } from "./download-media.ts";
import type { SourceType } from "./sources.ts";

export type DownloadResponse = {
	cleanup: () => Promise<unknown>;
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

export async function buildDownloadResponse(
	ctx: CustomContext,
	data: DownloadResponseData,
): Promise<DownloadResponse> {
	console.info("[DownloadResponse] Building response", {
		sourceType: data.sourceType,
		url: data.url,
		userId: data.userId,
	});

	const tempDir = await Deno.makeTempDir({
		prefix: `ummrobot-${data.userId}-`,
	});
	const cleanup = async () => await deletePaths([tempDir]);
	const previewUrl = data.fallbackUrl ?? data.url;
	const mode = data.sourceType === "youtubeVideo" ? "video" : "generic";
	const media = await downloadMediaForUrl(data.url, tempDir, mode);

	if (!media) {
		return {
			cleanup,
			media: null,
			previewUrl,
			text:
				data.sourceType === "youtubeVideo"
					? ctx.i18n.t("error.video")
					: getPromoText(ctx, data, "post"),
		};
	}

	if (data.sourceType === "youtubeVideo") {
		const title =
			media.kind === "images"
				? "Downloaded Video"
				: (media.title ?? "Downloaded Video");
		const resourceKey =
			media.kind === "audio" ? "downloaded.audio" : "downloaded.video";
		return {
			cleanup,
			media,
			previewUrl,
			text: ctx.i18n.t(resourceKey, {
				title,
				url: data.url,
			}),
		};
	}

	const kind =
		media.kind === "images"
			? "slider"
			: media.kind === "audio"
				? "audio"
				: media.kind === "image"
					? "image"
					: "video";

	return {
		cleanup,
		media,
		previewUrl,
		text: getPromoText(ctx, data, kind),
	};
}
