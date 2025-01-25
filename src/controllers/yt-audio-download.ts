import { Composer, InputFile } from "grammy";

import type { CustomContext } from "../types/context.js";
import { downloadYouTubeAudio } from "../services/yt-dlp.js";
import { deleteFile } from "../helpers/fs.js";

export const ytAudioDownloadController = new Composer<CustomContext>();

ytAudioDownloadController
	.chatType(["supergroup", "private", "group"])
	.command("mp3", async (ctx, next) => {
		const url = ctx.match;
		if (!url) {
			await next();
			return;
		}

		const filepath = `/tmp/ummrobot-${Date.now()}-${ctx.from.id}.mp3`;
		try {
			await ctx.text("status.downloading");
			const audio = await downloadYouTubeAudio(ctx.binary, url, filepath);
			const displayName = `${audio.title?.replaceAll(" ", "_") ?? "youtube-audio"}.mp3`;
			await ctx.replyWithAudio(new InputFile(audio.path, displayName), {
				title: audio.title ?? "Downloaded YouTube Video MP3",
				thumbnail: audio.thumbnail as unknown as InputFile,
			});
			await deleteFile(audio.path);
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
			await ctx.text("error", {
				error: `Failed to download audio: ${errorText}`,
			});
		}
	});
