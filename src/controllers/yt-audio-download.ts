import { Composer, InputFile } from "grammy";

import { deleteFile } from "../helpers/fs.js";
import { downloadYouTubeAudio, humanifyError } from "../services/yt-dlp.js";
import type { CustomContext } from "../types/context.js";

export const ytAudioDownloadController = new Composer<CustomContext>();

ytAudioDownloadController
	.chatType(["supergroup", "private", "group"])
	.command("audio", async (ctx, next) => {
		const url = ctx.match || ctx.message.reply_to_message?.text;
		if (!url) {
			await next();
			return;
		}

		const filepath = `/tmp/ummrobot-${Date.now()}-${ctx.from.id}.mp3`;
		try {
			const status = await ctx.text("status.downloading.audio");
			const audio = await downloadYouTubeAudio(ctx.binary, url, filepath);
			const displayName = `${audio.title?.replaceAll(" ", "_") ?? "youtube-audio"}.mp3`;
			await ctx.replyWithAudio(new InputFile(audio.path, displayName), {
				title: audio.title ?? "Downloaded YouTube Video MP3",
				caption: ctx.i18n.t("downloaded.audio", {
					title: audio.title ?? "Downloaded YouTube Video MP3",
					url,
				}),
				parse_mode: "HTML",
				thumbnail: audio.thumbnail as unknown as InputFile,
			});
			await deleteFile(audio.path);
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
			console.error("[YTA] Failed to respond with audio", {
				url,
				filepath,
				error,
			});
			await ctx.text("error.audio", { error: humanifyError(errorText) });
		}
	});
