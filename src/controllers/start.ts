import { Composer } from 'grammy';

import type { CustomContext } from '../types/context.js';

export const startController = new Composer<CustomContext>();
startController.command('start', async ctx => {
  const binaryVersion = await ctx.binary.getVersion();
  await ctx.text('greeting', { binaryVersion });
});
