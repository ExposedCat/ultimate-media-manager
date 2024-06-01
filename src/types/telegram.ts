import type { Api, Bot as TelegramBot, NextFunction } from 'grammy';

import type { CustomContext } from './context.js';

export type Bot = TelegramBot<CustomContext>;

export type Handler = (ctx: CustomContext, next?: NextFunction) => void;

export type Extra = Parameters<Api['sendMessage']>[2];
