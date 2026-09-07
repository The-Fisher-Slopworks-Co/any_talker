// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { Bot, Api } from "grammy";
import type { Storage } from "../storage/types";
import type { RateLimiter } from "../ratelimit/types";
import type { BudgetGuard } from "../budget/types";
import type { AIClient } from "../ai/types";
import type { LogFormat } from "../log";
import type { TelegramEnv } from "../telegram-env";
import type { BotContext } from "../bot/middleware/lang";
import type { ManagedBot } from "./types";

// Minimal shape of the Telegram bot user carried by a `managed_bot` update /
// `managed_bot_created` service message.
export type ManagedBotUser = {
  id: number;
  username?: string | undefined;
  first_name: string;
};

type RunningBot = {
  record: ManagedBot;
  bot: Bot<BotContext>;
};

export type BotManagerDeps = {
  storage: Storage;
  rateLimiter: RateLimiter;
  budgetGuard: BudgetGuard;
  ai: AIClient;
  // Passed straight through to every character bot: whether the answering model
  // takes video input (decides whole clip vs sampled frames).
  supportsVideoInput?: (modelId: string) => Promise<boolean>;
  ownerId: string;
  // Passed through to every character bot, and to the getMe probe below: a
  // managed bot's token belongs to the same copy of Telegram as the main one.
  telegramEnv?: TelegramEnv | undefined;
  // The main bot's api — used to broker managed bot tokens (getManagedBotToken).
  mainApi: Api;
  // The main bot's user id. A managed bot treats it as a sibling when deciding
  // whether it is alone in a group (so a bare `/ask` defers to the main bot).
  mainBotId: string;
  logFormat: LogFormat;
  logIncomingUpdates: boolean;
  logDebug: boolean;
};

// The per-manager scope every managed-bots module works against: the injected
// deps plus the live registry of polling loops. Handed to the token broker, the
// polling supervisor and the profile admin as their first argument instead of
// being captured in one class closure.
export type ManagerRuntime = {
  deps: BotManagerDeps;
  running: Map<string, RunningBot>;
  // Ids whose startBot is mid-flight (between its first await and `running.set`).
  // Guards against two concurrent starts for the same bot — e.g. a boot-time
  // `loadAndStartAll` racing a `managed_bot` update — spawning two polling loops
  // (which would conflict on Telegram's getUpdates).
  starting: Set<string>;
  // Restart hook, routed back through `BotManager.startBot` rather than called
  // directly, so crash recovery goes through the same concurrent-start guard
  // (and any subclass override) a first start does.
  startBot: (record: ManagedBot, token: string) => Promise<void>;
  // The other family bots a managed bot shares chats with: the main bot plus
  // every OTHER running managed bot (self excluded). Used by the bare-`/ask`
  // alone-check — a managed bot stays silent on a bare `/ask` in a group while
  // any of these is present there.
  siblingBotIds: (selfBotId: string) => string[];
};

export function createRuntime(
  deps: BotManagerDeps,
  startBot: (record: ManagedBot, token: string) => Promise<void>,
): ManagerRuntime {
  const running = new Map<string, RunningBot>();
  return {
    deps,
    running,
    starting: new Set<string>(),
    startBot,
    siblingBotIds(selfBotId: string): string[] {
      const ids = [deps.mainBotId];
      for (const id of running.keys()) {
        if (id !== selfBotId) ids.push(id);
      }
      return ids;
    },
  };
}
