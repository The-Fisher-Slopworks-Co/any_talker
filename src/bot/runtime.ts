// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { Api } from "grammy";
import type { Message } from "grammy/types";
import type { Storage } from "../storage/types";
import type { RateLimiter } from "../ratelimit/types";
import type { BudgetGuard } from "../budget/types";
import type { AIClient } from "../ai/types";
import type { PersonaResolver } from "../managed-bots/persona";
import type { BudgetDenyReason, ChatType } from "../shared/types";
import { formatLog, type LogFields, type LogFormat } from "../log";
import type { TelegramEnv } from "../telegram-env";
import { fetchTelegramPhoto } from "./photo";
import { makeShouldAnswer } from "./routing";
import { makeChatMenuSync, type ChatMenuSync } from "./chat-commands";
import type { AskMatch } from "./routing";
import { makeShouldHandleSharedCommand } from "./shared-command";
import { createAlerts } from "./alerts";
import { createVideoPipeline, type VideoPipeline } from "./video-pipeline";
import type { BotContext } from "./middleware/lang";

// Identifies a managed (non-main) bot. Its presence switches `createBot` into
// managed mode: `/ask` is matched ONLY when explicitly addressed as `@self`,
// and the bot's id scopes per-character storage + the tool call context.
type BotPersona = {
  botId: string;
};

export type BotDeps = {
  botToken: string;
  // Which copy of Telegram the token belongs to. Omitted ⇒ production, so a
  // test bot (and every existing caller) needs to say nothing.
  telegramEnv?: TelegramEnv | undefined;
  ownerId: string;
  storage: Storage;
  rateLimiter: RateLimiter;
  budgetGuard: BudgetGuard;
  ai: AIClient;
  // Resolves the character to answer as for a given chat (settings + name).
  resolver: PersonaResolver;
  // Whether a model takes video input (`ModelCatalog.supportsVideoInput`).
  // Decides whether a clip is sent whole or as sampled frames — see
  // `resolveVideoMode`. Optional so a test bot can omit it (⇒ always frames).
  supportsVideoInput?: ((modelId: string) => Promise<boolean>) | undefined;
  // Present for managed bots only; absent ⇒ the main bot.
  persona?: BotPersona | undefined;
  // The user ids of the OTHER family bots this bot should consider for routing.
  // For a managed bot: the main bot + every other managed bot — used both for
  // the alone-check and to recognize a bare `/ask` replying to a sibling. For
  // the main bot: the managed (character) bots (`BotManager.managedBotIds()`) —
  // it never needs the alone-check, but uses these to recognize a bare `/ask`
  // replying to a *present* character's message and defer to that character.
  siblingBotIds?: (() => string[]) | undefined;
  logFormat: LogFormat;
  logIncomingUpdates: boolean;
  logDebug: boolean;
};

// Everything a dispatcher or listener needs beyond `deps`: the per-bot scope,
// the two log channels, and the collaborators that used to be closures inside
// `createBot`. Built once per bot so the modules below can be plain functions
// taking a runtime, instead of nested closures no test can reach.
export type BotRuntime = {
  deps: BotDeps;
  // The managed bot's id; null for the main bot. Passed to the pure handlers,
  // which scope themselves.
  botId: string | null;
  // `deps.telegramEnv` with its default applied, so the hand-built file URLs
  // resolve it in one place instead of at every call site.
  telegramEnv: TelegramEnv;
  // Storage scoped to this bot, for the per-character calls made in the bot
  // layer (private-chat flag, album index, guest thread, reply images).
  // Everything else (user/chat directory, presence, …) stays on `deps.storage`.
  scopedStorage: Storage;
  debugLog: (msg: string, fields?: LogFields) => void;
  // Access denials are silent toward the chat, so the log line is the only
  // place that says WHY the bot stayed quiet (blacklisted vs not whitelisted).
  // Deliberately not debug-gated: it must be answerable from prod logs.
  logAccessDenied: (fields: LogFields) => void;
  fetchPhoto: (fileId: string) => Promise<Uint8Array>;
  // Reconciles this bot's chat-scoped command menu in one group chat, so a
  // shared command (`/feedback`) is listed by exactly one of the family bots
  // that are actually there (see `chat-commands.ts`).
  syncChatMenu: ChatMenuSync;
  // Whether a matched ask is addressed to THIS bot (see `routing.ts`).
  shouldAnswer: (
    ctx: BotContext,
    match: AskMatch,
    replyToMessage: Message | undefined,
  ) => Promise<boolean>;
  // Whether THIS bot acts on a matched shared command — one that every family
  // bot in the chat matched identically (see `shared-command.ts`).
  shouldHandleSharedCommand: (
    ctx: BotContext,
    explicit: boolean,
  ) => Promise<boolean>;
  alerts: {
    globalCapBreach: (api: Api, reason: BudgetDenyReason) => Promise<void>;
    newGroup: (
      api: Api,
      chat: { id: string; type: ChatType; title: string | null },
    ) => Promise<void>;
  };
  video: VideoPipeline;
};

export function createRuntime(deps: BotDeps): BotRuntime {
  const botId = deps.persona?.botId ?? null;
  const telegramEnv = deps.telegramEnv ?? "prod";
  return {
    deps,
    botId,
    telegramEnv,
    scopedStorage: deps.storage.forBot(botId),
    debugLog: (msg, fields = {}) => {
      if (!deps.logDebug) return;
      console.log(formatLog({ level: "debug", msg, fields }, deps.logFormat));
    },
    logAccessDenied: (fields) => {
      console.log(
        formatLog(
          { level: "info", msg: "ask_access_denied", fields },
          deps.logFormat,
        ),
      );
    },
    fetchPhoto: (fileId) =>
      fetchTelegramPhoto({
        storage: deps.storage,
        botToken: deps.botToken,
        fileId,
        env: telegramEnv,
      }),
    syncChatMenu: makeChatMenuSync({
      storage: deps.storage,
      siblingBotIds: deps.siblingBotIds,
    }),
    shouldAnswer: makeShouldAnswer({
      storage: deps.storage,
      // Managed bots respond only to `/ask@self` (require an explicit
      // mention); the main bot also answers a bare `/ask`.
      requireMention: deps.persona !== undefined,
      siblingBotIds: deps.siblingBotIds,
    }),
    shouldHandleSharedCommand: makeShouldHandleSharedCommand({
      // Presence is global, not per-character: `deps.storage`, not the scoped one.
      storage: deps.storage,
      siblingBotIds: deps.siblingBotIds,
    }),
    alerts: createAlerts({
      storage: deps.storage,
      ownerId: deps.ownerId,
    }),
    video: createVideoPipeline({
      botToken: deps.botToken,
      telegramEnv,
      resolver: deps.resolver,
      supportsVideoInput: deps.supportsVideoInput,
    }),
  };
}
