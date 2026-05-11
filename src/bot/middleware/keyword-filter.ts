// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { MiddlewareFn } from "grammy";
import type { Storage } from "../../storage/types";
import { messageMatchesKeyword } from "../../shared/types";
import type { BotContext } from "./lang";

export function makeKeywordFilterMiddleware(
  storage: Storage,
): MiddlewareFn<BotContext> {
  return async (ctx, next) => {
    const msg = ctx.message;
    const chatId = ctx.chat?.id;
    if (!msg || chatId === undefined) {
      await next();
      return;
    }
    const settings = await storage.getChatSettings(String(chatId));
    const filter = settings?.keywordFilter;
    if (!filter || !filter.enabled || filter.keywords.length === 0) {
      await next();
      return;
    }
    const text = msg.text ?? msg.caption ?? "";
    if (!messageMatchesKeyword(text, filter.keywords)) {
      await next();
      return;
    }
    try {
      await ctx.deleteMessage();
    } catch (err) {
      console.error("keyword filter: deleteMessage failed:", err);
    }
  };
}
