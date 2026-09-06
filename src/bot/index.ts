// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { Bot } from "grammy";
import { proxiedFetch } from "../proxy";
import { makeIncomingUpdateLogger } from "./log-update";
import { makeLangMiddleware, type BotContext } from "./middleware/lang";
import { makeKeywordFilterMiddleware } from "./middleware/keyword-filter";
import { makeDirectoryMiddleware } from "./middleware/directory";
import { createRuntime, type BotDeps } from "./runtime";
import { dispatchGuest } from "./dispatch/guest";
import { createMediaGroupDispatcher } from "./dispatch/media-group";
import { registerMessageListeners } from "./listeners/messages";
import { registerChatEventListeners } from "./listeners/chat-events";

export type { BotDeps };

// Composition root of the bot layer: build the per-bot runtime (scope, logs,
// alerts, ask routing, video pipeline — see `runtime.ts`), then stack the
// middleware and register the listeners. Everything that used to be a closure
// in here now lives in `dispatch/`, `listeners/` and `middleware/`, and takes
// the runtime as its first argument.
export function createBot(deps: BotDeps): Bot<BotContext> {
  const bot = new Bot<BotContext>(deps.botToken, {
    client: { fetch: proxiedFetch as unknown as typeof fetch },
  });

  const rt = createRuntime(deps);

  bot.use(
    makeIncomingUpdateLogger({
      format: deps.logFormat,
      enabled: deps.logIncomingUpdates,
    }),
  );
  bot.use(makeLangMiddleware(deps.storage));
  bot.use(makeDirectoryMiddleware(rt));

  // A guest query is answered inline and never reaches the ask listeners: it
  // carries its own reply channel (`answerGuestQuery`) and its own thread.
  bot.use(async (ctx, next) => {
    const guestMsg = ctx.update.guest_message;
    if (guestMsg) {
      await dispatchGuest(rt, ctx, guestMsg);
      return;
    }
    await next();
  });

  bot.use(makeKeywordFilterMiddleware(deps.storage));

  registerMessageListeners(bot, rt, createMediaGroupDispatcher(rt));
  registerChatEventListeners(bot, rt);

  bot.catch((err) => {
    console.error("Unhandled bot error:", err);
  });

  return bot;
}
