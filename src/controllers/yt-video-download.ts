import { Composer, InputFile } from "grammy";

import { deleteFile } from "../helpers/fs.js";
import { downloadAdapter } from "../services/media-adapters.js";
import {
	downloadMedia,
	downloadYouTubeAudio,
	getVideoMetadata,
	humanifyError,
} from "../services/yt-dlp.js";
import type { CustomContext } from "../types/context.js";

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
		const filepath = `/tmp/ummrobot-${Date.now()}-${ctx.from.id}.mp4`;
		try {
			const { title, thumbnail, sizeMb } = await getVideoMetadata(
				ctx.binary,
				url,
			);

			const status = await ctx.text("status.downloading.video");
			statusMessageId = status.message_id;

			if (sizeMb > MAX_VIDEO_SIZE_MB) {
				await ctx.text("error.videoSize", {
					size: sizeMb.toFixed(1),
					limit: MAX_VIDEO_SIZE_MB,
				});
			} else {
				const video = await downloadMedia(ctx.binary, url, "youtube", filepath);
				const extra: Parameters<typeof ctx.replyWithVideo>[1] = {
					caption: ctx.i18n.t("downloaded.video", {
						title: title ?? "Downloaded YouTube Video",
						url,
					}),
					parse_mode: "HTML",
					thumbnail: thumbnail as unknown as InputFile,
				};
				try {
					await ctx.replyWithVideo(new InputFile(video, title), extra);
				} catch {
					await ctx.replyWithDocument(new InputFile(video, title), extra);
				}
			}
			try {
				await ctx.api.deleteMessage(ctx.chatId, status.message_id);
			} catch {}
			return true;
		} catch (error) {
			const errorObject = error as Error;
			const stringError = errorObject.toString();
			const errorText =
				stringError.split("ERROR:")[1] ||
				errorObject.toString() ||
				"Unknown Error";
			console.error("[YTA] Failed to respond with video", {
				url,
				filepath,
				error,
			});
			await ctx.text("error.video", { error: humanifyError(errorText) });
		} finally {
			if (statusMessageId) {
				await ctx.api.deleteMessage(ctx.chat.id, statusMessageId);
			}
			try {
				await deleteFile(filepath);
			} catch {}
		}
	});
