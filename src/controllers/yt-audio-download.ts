import { Composer, InputFile } from 'grammy';

import type { CustomContext } from '../types/context.js';
import { downloadYouTubeAudio } from '../services/yt-dlp.js';
import { deleteFile } from '../helpers/fs.js';

export const ytAudioDownloadController = new Composer<CustomContext>();

ytAudioDownloadController.chatType(['supergroup', 'private', 'group']).command('mp3', async (ctx, next) => {
  const url = ctx.match.at(1);
  if (!url) {
    await next();
    return;
  }

  const filepath = `/tmp/ummrobot-${Date.now()}-${ctx.from.id}.mp3`;
  try {
    await ctx.text('status.downloading');
    const filename = await downloadYouTubeAudio(ctx.binary, url, filepath);
    await ctx.replyWithAudio(new InputFile(filename));
    await deleteFile(filename);
    return true;
  } catch (error) {
    console.error('[YTA] Failed to respond with audio', { url, filepath, error });
    await ctx.text('error', {
      error: `Failed to download audio: ${error}`,
    });
  }
});
