import { Composer } from 'grammy';

import type { CustomContext } from '../types/context.js';
import { getBinaryVersion } from '../services/yt-dlp.js';

export const startController = new Composer<CustomContext>();
startController.command('start', async ctx => {
  const binaryVersion = await getBinaryVersion(ctx.binary);
  await ctx.text('greeting', { binaryVersion });
});
