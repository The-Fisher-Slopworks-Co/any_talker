// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { Storage } from "../../storage/types";
import type { RateLimiter } from "../../ratelimit/types";
import type { BudgetGuard } from "../../budget/types";
import type { AIClient } from "../../ai/types";
import { recordDenial } from "../../spending/record";
import { runAiTurn } from "../../ai/turn";
import { isAllowed } from "../access";
import {
  buildContext,
  buildUserEnvelope,
  conversationStorage,
  type ReplyTarget,
  type Sender,
} from "../context-builder";
import type { PersonaResolver } from "../../managed-bots/persona";
import type { ToolEffect } from "../../ai/tools/registry";
import type { DetailLevel } from "../../ai/instruction";
import type { Lang } from "../../shared/i18n";
import type { WindowKind, BudgetDenyReason } from "../../shared/types";

export type AskInput = {
  storage: Storage;
  rateLimiter: RateLimiter;
  budgetGuard: BudgetGuard;
  ai: AIClient;
  // Resolves the character to answer as (settings + display name) for this chat.
  resolver: PersonaResolver;
  // Scope of the bot handling this turn: null/undefined = main bot, a managed
  // bot's id otherwise. Scopes per-character storage and the tool call context.
  botId?: string | null;
  ownerId: string;
  now: number;
  chatId: string;
  userId: string;
  askMessageId: number;
  sender: Sender;
  userText: string;
  quote: string | null;
  images: Uint8Array[];
  audios?: Uint8Array[];
  imageFileIds: string[];
  replyImageFileIds: string[];
  replyTarget: ReplyTarget | null;
  lang: Lang;
  detailLevel: DetailLevel;
  onAIStart?: () => void;
  fetchPhoto?: (fileId: string) => Promise<Uint8Array | null>;
};

export type AskOutcome =
  | { kind: "denied" }
  | { kind: "usage" }
  | {
      // Denied by a hard USD budget cap. `reason` is for metrics/alerting only;
      // the user sees a generic "try later" (never the financial detail).
      kind: "budgetLimited";
      reason: BudgetDenyReason;
      persistConversation: PersistFailedTurn;
    }
  | {
      kind: "rateLimited";
      limitedBy: WindowKind;
      msUntilReset: number;
      persistConversation: PersistFailedTurn;
    }
  | {
      kind: "answered";
      text: string;
      botName: string | null;
      totalTokens: number;
      effects: ToolEffect[];
      expandableThreshold: number;
      persistConversation: (botMsgId: number) => Promise<void>;
    }
  | { kind: "error"; message: string; persistConversation: PersistFailedTurn };

// Persists a turn the AI never answered (rate limit, provider error). The
// dispatcher passes the notice it actually sent so the stored transcript stays
// truthful — and so a later reply to either message still carries the chain.
export type PersistFailedTurn = (
  botMsgId: number,
  botAnswer: string,
) => Promise<void>;

export async function askHandler(input: AskInput): Promise<AskOutcome> {
  // Per-character storage view: scoped methods (user facts, this bot's own
  // reminders) hit this bot's namespace; every other method is shared.
  // forBot(null) is the main bot and yields the original unprefixed keys.
  const storage = input.storage.forBot(input.botId ?? null);
  // The conversation graph is family-shared in group chats so a reply across
  // bots carries context, and per-character in DMs (see `conversationStorage`).
  const convStorage = conversationStorage(
    input.storage,
    input.botId ?? null,
    input.chatId,
  );

  const [{ settings, botName }, userTimezone] = await Promise.all([
    input.resolver(input.chatId),
    storage.getUserTimezone(input.userId),
  ]);
  const timezone = userTimezone ?? settings.timezone;

  // Access gate: owner always passes; otherwise the whitelist is consulted only
  // while `whitelistEnabled` (the budget guard is the safety net when it's off).
  const allowed = await isAllowed({
    storage,
    ownerId: input.ownerId,
    userId: input.userId,
    chatId: input.chatId,
    whitelistEnabled: settings.whitelistEnabled,
  });
  if (!allowed) return { kind: "denied" };

  const audios = input.audios ?? [];
  const hasQuote = input.quote !== null && input.quote.trim() !== "";
  if (
    input.userText.trim() === "" &&
    !hasQuote &&
    input.images.length === 0 &&
    audios.length === 0
  ) {
    if (input.replyTarget === null) return { kind: "usage" };
    // A reply keeps a bare /ask meaningful only when the replied-to message
    // itself is new content ("what about this?"). Replying into the bot's own
    // conversation chain adds nothing the model doesn't already have — the
    // chain IS the context — so it gets the usage hint too, instead of an AI
    // turn with an empty question.
    const node = await convStorage.getConversation(
      input.chatId,
      input.replyTarget.messageId,
    );
    if (node) return { kind: "usage" };
  }

  // Persist this turn into the conversation graph under BOTH the bot's reply
  // message id and the user's ask message id (unique within a chat, so no
  // collision): a Telegram reply chain can pass through either side's message,
  // and both must resolve the chain. Runs for every outcome that sent a reply —
  // including rate-limited/error turns, where `botAnswer` is the failure notice
  // — so a failed turn never severs the chain.
  const persistTurn = async (botMsgId: number, botAnswer: string) => {
    let parentBotMsgId: number | null = null;
    if (input.replyTarget) {
      const existing = await convStorage.getConversation(
        input.chatId,
        input.replyTarget.messageId,
      );
      if (existing) parentBotMsgId = input.replyTarget.messageId;
    }
    const allImageFileIds = [...input.imageFileIds, ...input.replyImageFileIds];
    const node = {
      userQuestion: buildUserEnvelope({
        sender: input.sender,
        quote: input.quote,
        text: input.userText,
      }),
      botAnswer,
      parentBotMsgId,
      ts: input.now,
      userImageFileIds:
        allImageFileIds.length > 0 ? allImageFileIds : undefined,
    };
    await Promise.all([
      convStorage.saveConversation(input.chatId, botMsgId, node),
      convStorage.saveConversation(input.chatId, input.askMessageId, node),
    ]);
  };

  const isOwner = input.userId === input.ownerId;

  // Hard USD budget gate (money), checked before the token rate limit
  // (fairness) — the coarser, cheaper "is the bot even allowed to spend more"
  // question. Disabled/owner-exempt short-circuit inside the guard.
  const budgetVerdict = await input.budgetGuard.check(
    {
      userId: input.userId,
      chatId: input.chatId,
      isOwner,
      now: input.now,
    },
    settings.budget,
  );
  if (!budgetVerdict.allowed) {
    recordDenial(storage, input.userId, input.now);
    return {
      kind: "budgetLimited",
      reason: budgetVerdict.reason,
      persistConversation: persistTurn,
    };
  }

  const skipRateLimit = isOwner && settings.rateLimit.ownerExempt;
  if (!skipRateLimit) {
    const r = await input.rateLimiter.check(
      input.userId,
      settings.rateLimit,
      input.now,
    );
    if (!r.allowed) {
      recordDenial(storage, input.userId, input.now);
      return {
        kind: "rateLimited",
        limitedBy: r.limitedBy,
        msUntilReset: r.msUntilReset,
        persistConversation: persistTurn,
      };
    }
  }

  const messages = await buildContext({
    storage: convStorage,
    chatId: input.chatId,
    sender: input.sender,
    userText: input.userText,
    quote: input.quote,
    images: input.images,
    audios,
    replyTarget: input.replyTarget,
    fetchPhoto: input.fetchPhoto,
  });

  input.onAIStart?.();

  // Surface the user's remembered facts in the system prompt so the model can
  // use them without having to call list_facts on every turn.
  const facts = await storage.listUserFacts(input.userId);

  // Assemble the request, run the model, and do the post-call accounting
  // (owner-exempt token deduction with the detail-level multiplier + the
  // four-ledger spend booking) in one place shared with guest mode and reminder
  // delivery. A thrown `ai.ask` propagates before any accounting runs.
  let result;
  try {
    result = await runAiTurn({
      ai: input.ai,
      rateLimiter: input.rateLimiter,
      storage,
      models: settings.models,
      systemPrompt: settings.systemPrompt,
      rateLimit: settings.rateLimit,
      userId: input.userId,
      ownerId: input.ownerId,
      chatId: input.chatId,
      botId: input.botId ?? null,
      source: "ask",
      replyToMessageId: input.askMessageId,
      timezone,
      lang: input.lang,
      now: input.now,
      messages,
      detailLevel: input.detailLevel,
      facts,
      contextMessages: messages,
    });
  } catch (err) {
    return {
      kind: "error",
      message: err instanceof Error ? err.message : String(err),
      persistConversation: persistTurn,
    };
  }

  // A model can legitimately finish with no text (e.g. an output-token cap hit
  // mid-reasoning). Surface it as an error turn — Telegram rejects empty
  // messages, so trying to send it would only crash the dispatcher.
  if (result.text.trim() === "") {
    return {
      kind: "error",
      message: "AI returned an empty answer",
      persistConversation: persistTurn,
    };
  }

  // The AI now emits Rich Markdown sent verbatim via sendRichMessage; Telegram
  // parses it server-side (only supported tags/schemes are honored), so there
  // is no HTML sanitization step. The same text is persisted as conversation
  // context for later turns.
  const body = result.text;

  return {
    kind: "answered",
    text: body,
    botName,
    totalTokens: result.totalTokens,
    effects: result.effects,
    expandableThreshold: settings.expandableBlockquoteThreshold,
    persistConversation: (botMsgId) => persistTurn(botMsgId, body),
  };
}
