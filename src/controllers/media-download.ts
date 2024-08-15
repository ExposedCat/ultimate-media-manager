import { Composer } from 'grammy';

import type { CustomContext } from '../types/context.js';
import { ddInstagramAdapter, downloadAdapter } from '../services/media-adapters.js';
import type { MediaSource } from '../services/media-adapters.js';

const SOURCES: MediaSource[] = [
  { type: 'tiktok', match: 'tiktok.com/' },
  { type: 'instagram', match: /instagram.com\/.+?\/reel\// },
  { type: 'instagram', match: 'instagram.com/reels/' },
  { type: 'instagram', match: 'instagram.com/reel/' },
  { type: 'instagram', match: 'instagram.com/p/' },
  { type: 'facebook', match: 'fb.watch/' },
  { type: 'youtube', match: 'youtube.com/shorts/' },
];

export const mediaDownloadController = new Composer<CustomContext>();
mediaDownloadController.on(['message::url', 'message::text_link'], async (ctx, next) => {
  const text = ctx.message.text;
  const entities = ctx.message.entities ?? ctx.message.caption_entities ?? [];

  if (ctx.message.forward_origin?.type === 'user' && ctx.message.forward_origin.sender_user.is_bot) {
    return;
  }

  const userName = [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' ');

  const urls: string[] = [];

  for (const entity of entities) {
    if (entity.type === 'url') {
      urls.push(text!.slice(entity.offset, entity.length));
    } else if (entity.type === 'text_link') {
      urls.push(entity.url);
    }
  }

  let shouldCleanup = false;
  let somethingSent = false;

  for (const url of urls) {
    let sent = false;

    for (const { type, match } of SOURCES) {
      if (typeof match === 'string' ? url.includes(match) : match.test(url)) {
        const adapter = {
          instagram: ddInstagramAdapter,
          tiktok: downloadAdapter,
          facebook: downloadAdapter,
          youtube: downloadAdapter,
        }[type];

        sent = await adapter(ctx, {
          source: { type, match },
          userId: ctx.from.id,
          userName,
          url,
          replyId: ctx.message.reply_to_message?.message_id,
          threadId: ctx.message.is_topic_message ? ctx.message.message_thread_id : undefined,
        });
      }
    }

    if (sent) {
      somethingSent = true;
      if (!shouldCleanup && text === url) {
        shouldCleanup = true;
      }
    }
  }

  if (!somethingSent) {
    return await next();
  }

  if (shouldCleanup && ctx.objects.chat?.settings?.cleanup) {
    try {
      await ctx.deleteMessage();
    } catch {
      // ignore
    }
  }
});
