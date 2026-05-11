import { Composer, InputFile } from "grammy";

import { deletePaths } from "../helpers/fs.ts";
import {
	downloadYoutubeVideo,
	prepareYoutubeVideo,
} from "../services/youtube-video-download.ts";
import type { CustomContext } from "../types/context.ts";

const MAX_VIDEO_SIZE_MB = 300;

export const ytVideoDownloadController = new Composer<CustomContext>();

ytVideoDownloadController
	.chatType(["supergroup", "private", "group"])
	.command("video", async (ctx, next) => {
		const url = ctx.match || ctx.message.reply_to_message?.text;
		if (!url) {
			await next();
			return;
		}

		let statusMessageId: number | null = null;
		const videoId = `${Date.now()}-${ctx.from.id}`;
		const tempDir = await Deno.makeTempDir({
			prefix: `ummrobot-${videoId}-`,
		});
		try {
			const prepared = await prepareYoutubeVideo(url, videoId);
			if (!prepared) {
				console.log("!prepared", prepared);
				await ctx.text("error.video");
				return;
			}

			if (prepared.sizeMb > MAX_VIDEO_SIZE_MB) {
				await ctx.text("error.videoSize", {
					size: prepared.sizeMb.toFixed(1),
					limit: MAX_VIDEO_SIZE_MB,
				});
				return;
			}

			const status = await ctx.text("status.downloading.video");
			statusMessageId = status.message_id;

			const video = await downloadYoutubeVideo(prepared, tempDir);

			const extra: Parameters<typeof ctx.replyWithVideo>[1] = {
				caption: ctx.i18n.t("downloaded.video", {
					title: prepared.title,
					url,
				}),
				parse_mode: "HTML",
			};
			try {
				await ctx.replyWithVideo(
					new InputFile(video, `${prepared.title}.${prepared.extension}`),
					extra,
				);
			} catch {
				await ctx.replyWithDocument(
					new InputFile(video, `${prepared.title}.${prepared.extension}`),
					extra,
				);
			}

			return true;
		} catch (error) {
			console.error(error);
			await ctx.text("error.video");
		} finally {
			if (statusMessageId) {
				await ctx.api.deleteMessage(ctx.chat.id, statusMessageId);
			}
			await deletePaths([tempDir]);
		}
	});
