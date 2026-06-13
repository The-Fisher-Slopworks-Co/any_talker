// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { Storage } from "../../storage/types";
import type { RateLimiter } from "../../ratelimit/types";
import type { AIClient } from "../../ai/types";
import { isAllowed } from "../access";
import {
  buildContext,
  buildUserEnvelope,
  conversationStorage,
  type ReplyTarget,
  type Sender,
} from "../context-builder";
import type { PersonaResolver } from "../../managed-bots/persona";
import { getAllTools, type ToolEffect } from "../../ai/tools/registry";
import {
  buildInstruction,
  detailLevelMultiplier,
  detailLevelReasoningEffort,
  type DetailLevel,
} from "../../ai/instruction";
import type { Lang } from "../../shared/i18n";

export type AskInput = {
  storage: Storage;
  rateLimiter: RateLimiter;
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
      kind: "rateLimited";
      minutesUntilNextRefill: number;
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

  const [allowed, byokKey, byokModels] = await Promise.all([
    isAllowed({
      storage,
      ownerId: input.ownerId,
      userId: input.userId,
      chatId: input.chatId,
    }),
    storage.getUserOpenrouterKey(input.userId),
    storage.getUserOpenrouterModels(input.userId),
  ]);
  if (!allowed && byokKey === null) return { kind: "denied" };

  const audios = input.audios ?? [];
  if (
    input.userText.trim() === "" &&
    input.replyTarget === null &&
    input.images.length === 0 &&
    audios.length === 0
  ) {
    return { kind: "usage" };
  }

  const [{ settings, botName }, userTimezone] = await Promise.all([
    input.resolver(input.chatId),
    storage.getUserTimezone(input.userId),
  ]);
  const timezone = userTimezone ?? settings.timezone;

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
  const skipRateLimit =
    byokKey !== null || (isOwner && settings.rateLimit.ownerExempt);
  if (!skipRateLimit) {
    const r = await input.rateLimiter.check(
      input.chatId,
      input.userId,
      settings.rateLimit,
      input.now,
    );
    if (!r.allowed) {
      return {
        kind: "rateLimited",
        minutesUntilNextRefill: Math.ceil(r.msUntilNextRefill / 60_000),
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

  const effects: ToolEffect[] = [];
  let result;
  try {
    result = await input.ai.ask({
      models:
        byokKey !== null && byokModels !== null && byokModels.length > 0
          ? byokModels
          : settings.models,
      system: buildInstruction(settings.systemPrompt, {
        timezone,
        lang: input.lang,
        detailLevel: input.detailLevel,
        facts,
      }),
      messages,
      tools: getAllTools(),
      providerSort: settings.providerSort,
      provider: settings.provider,
      serviceTier: settings.serviceTier,
      reasoningEffort: detailLevelReasoningEffort(input.detailLevel),
      apiKey: byokKey,
      toolCallContext: {
        source: "ask",
        chatId: input.chatId,
        userId: input.userId,
        botId: input.botId ?? null,
        replyToMessageId: input.askMessageId,
        timezone,
        lang: input.lang,
        now: input.now,
        effects,
        contextMessages: messages,
      },
    });
  } catch (err) {
    return {
      kind: "error",
      message: err instanceof Error ? err.message : String(err),
      persistConversation: persistTurn,
    };
  }

  if (!skipRateLimit) {
    const multiplier = detailLevelMultiplier(input.detailLevel, settings.rateLimit);
    const deduction = Math.round(result.totalTokens * multiplier);
    await input.rateLimiter.deduct(input.chatId, input.userId, deduction);
  }

  // Record spend regardless of rate-limit exemption — owner and BYOK usage is
  // still money this user spent through the bot. Best-effort: a storage hiccup
  // on this display-only accounting must not fail an answer already produced.
  await storage
    .addUserSpend(input.userId, result.costUsd ?? 0, input.now)
    .catch((err) => console.error("recording user spend failed:", err));

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
    effects,
    expandableThreshold: settings.expandableBlockquoteThreshold,
    persistConversation: (botMsgId) => persistTurn(botMsgId, body),
  };
}
