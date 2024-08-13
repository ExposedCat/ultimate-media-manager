import { InputFile } from 'grammy';

import type { CustomContext } from '../types/context.js';
import { deleteFile } from '../helpers/fs.js';
import { downloadMedia } from './yt-dlp.js';

export type MediaSource = {
  type: 'tiktok' | 'instagram' | 'facebook' | 'youtube';
  match: string | RegExp;
};

export type MediaAdapterData = {
  source: MediaSource;
  userId: number;
  userName: string;
  url: string;
  replyId?: number;
  threadId?: number;
};

export type MediaAdapter = (ctx: CustomContext, data: MediaAdapterData) => Promise<boolean>;

export const buildReplyExtra = (replyId: number | null | undefined, threadId: number | null | undefined) => ({
  ...(threadId && { message_thread_id: threadId }),
  ...(replyId && {
    reply_parameters: {
      message_id: replyId,
      allow_sending_without_reply: true,
    },
  }),
});

export const ddInstagramAdapter: MediaAdapter = async (ctx, data) => {
  await ctx.text(
    'promoCaption',
    {
      viewUrl: ctx.i18n.t('viewOn.instagram', {
        postUrl: data.url,
        userName: data.userName,
        userId: data.userId,
      }),
    },
    {
      link_preview_options: {
        is_disabled: false,
        url: data.url.replace('instagram', 'ddinstagram'),
        prefer_large_media: true,
        show_above_text: true,
      },
      ...buildReplyExtra(data.replyId, data.threadId),
    },
  );
  return true;
};

export const downloadAdapter: MediaAdapter = async (ctx, data) => {
  const shouldFormat = data.source.type === 'tiktok';

  const send = (source: string | InputFile) =>
    ctx.replyWithVideo(source, {
      caption: ctx.i18n.t('promoCaption', {
        viewUrl: ctx.i18n.t(`viewOn.${data.source.type}`, {
          postUrl: data.url,
          userName: data.userName,
          userId: data.userId,
        }),
      }),
      parse_mode: 'HTML',
      ...buildReplyExtra(data.replyId, data.threadId),
    });

  const logError = (error: Error, source: string) =>
    console.error('[TTC] Failed to respond with video', { source, error });

  const filepath = `/tmp/ummrobot-${Date.now()}-${data.userId}.mp4`;
  try {
    const filename = await downloadMedia(ctx.binary, data.url, filepath, shouldFormat);
    await send(new InputFile(filename));
    await deleteFile(filename);
    return true;
  } catch (error) {
    logError(error as Error, filepath);
  }

  return false;
};
