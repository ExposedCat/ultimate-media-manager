import type { Context, SessionFlavor } from 'grammy';
import type { I18nContextFlavor, TemplateData } from '@grammyjs/i18n';

import type { YTDlpWrap } from '~/services/yt-dlp.js';
import type { Extra } from './telegram.js';
import type { Chat, Database } from './database.js';

export type CustomContextFields = {
  text: (text: string, templateData?: TemplateData, extra?: Extra) => ReturnType<Context['reply']>;

  objects: { chat: Chat | null };

  db: Database;
  binary: YTDlpWrap;
};

export type CustomContext = Context & CustomContextFields & I18nContextFlavor & SessionFlavor<unknown>;
