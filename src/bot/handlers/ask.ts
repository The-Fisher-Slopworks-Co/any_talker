// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { Storage } from "../../storage/types";
import type { RateLimiter } from "../../ratelimit/types";
import type { AIClient } from "../../ai/types";
import { isAllowed } from "../access";
import { buildContext, buildUserEnvelope, type ReplyTarget, type Sender } from "../context-builder";
import { getEffectiveSettings } from "../../settings";
import { getAllTools, type ToolEffect } from "../../ai/tools/registry";
import {
  buildInstruction,
  detailLevelMultiplier,
  type DetailLevel,
} from "../../ai/instruction";
import { sanitizeHtml } from "../html";
import type { Lang } from "../../shared/i18n";

export type AskInput = {
  storage: Storage;
  rateLimiter: RateLimiter;
  ai: AIClient;
  ownerId: string;
  now: number;
  chatId: string;
  userId: string;
  askMessageId: number;
  sender: Sender;
  userText: string;
  quote: string | null;
  images: Uint8Array[];
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
  | { kind: "rateLimited"; minutesUntilNextRefill: number }
  | {
      kind: "answered";
      text: string;
      botName: string | null;
      totalTokens: number;
      effects: ToolEffect[];
      persistConversation: (botMsgId: number) => Promise<void>;
    }
  | { kind: "error"; message: string };

export async function askHandler(input: AskInput): Promise<AskOutcome> {
  const [allowed, byokKey] = await Promise.all([
    isAllowed({
      storage: input.storage,
      ownerId: input.ownerId,
      userId: input.userId,
      chatId: input.chatId,
    }),
    input.storage.getUserOpenrouterKey(input.userId),
  ]);
  if (!allowed && byokKey === null) return { kind: "denied" };

  if (
    input.userText.trim() === "" &&
    input.replyTarget === null &&
    input.images.length === 0
  ) {
    return { kind: "usage" };
  }

  const [settings, chatSettings, userTimezone] = await Promise.all([
    getEffectiveSettings(input.storage, input.chatId),
    input.storage.getChatSettings(input.chatId),
    input.storage.getUserTimezone(input.userId),
  ]);
  const botName = chatSettings?.botName?.trim() || null;
  const timezone = userTimezone ?? settings.timezone;

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
      };
    }
  }

  const messages = await buildContext({
    storage: input.storage,
    chatId: input.chatId,
    sender: input.sender,
    userText: input.userText,
    quote: input.quote,
    images: input.images,
    replyTarget: input.replyTarget,
    fetchPhoto: input.fetchPhoto,
  });

  input.onAIStart?.();

  const effects: ToolEffect[] = [];
  let result;
  try {
    result = await input.ai.ask({
      models: settings.models,
      system: buildInstruction(settings.systemPrompt, {
        timezone,
        lang: input.lang,
        detailLevel: input.detailLevel,
      }),
      messages,
      tools: getAllTools(),
      providerSort: settings.providerSort,
      apiKey: byokKey,
      toolCallContext: {
        source: "ask",
        chatId: input.chatId,
        userId: input.userId,
        replyToMessageId: input.askMessageId,
        timezone,
        lang: input.lang,
        now: input.now,
        effects,
        contextMessages: messages,
      },
    });
  } catch (err) {
    return { kind: "error", message: err instanceof Error ? err.message : String(err) };
  }

  if (!skipRateLimit) {
    const multiplier = detailLevelMultiplier(input.detailLevel, settings.rateLimit);
    const deduction = Math.round(result.totalTokens * multiplier);
    await input.rateLimiter.deduct(input.chatId, input.userId, deduction);
  }

  let parentBotMsgId: number | null = null;
  if (input.replyTarget) {
    const existing = await input.storage.getConversation(
      input.chatId,
      input.replyTarget.messageId,
    );
    if (existing) parentBotMsgId = input.replyTarget.messageId;
  }

  const envelope = buildUserEnvelope({
    sender: input.sender,
    quote: input.quote,
    text: input.userText,
  });

  const sanitized = sanitizeHtml(result.text);

  return {
    kind: "answered",
    text: sanitized,
    botName,
    totalTokens: result.totalTokens,
    effects,
    persistConversation: async (botMsgId) => {
      const allImageFileIds = [
        ...input.imageFileIds,
        ...input.replyImageFileIds,
      ];
      await input.storage.saveConversation(input.chatId, botMsgId, {
        userQuestion: envelope,
        botAnswer: sanitized,
        parentBotMsgId,
        ts: input.now,
        userImageFileIds:
          allImageFileIds.length > 0 ? allImageFileIds : undefined,
      });
    },
  };
}
