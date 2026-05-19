// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { Storage } from "../../storage/types";
import type { RateLimiter } from "../../ratelimit/types";
import type { AIClient } from "../../ai/types";
import { buildUserEnvelope, type Sender } from "../context-builder";
import { getEffectiveSettings } from "../../settings";
import { getAllTools, type ToolEffect } from "../../ai/tools/registry";
import { buildInstruction } from "../../ai/instruction";
import { sanitizeHtml } from "../html";
import type { AIMessage } from "../../ai/types";
import { MAX_REPLY_CHAIN_DEPTH, type GuestThreadNode } from "../../shared/types";
import type { Lang } from "../../shared/i18n";

export type GuestAskInput = {
  storage: Storage;
  rateLimiter: RateLimiter;
  ai: AIClient;
  ownerId: string;
  now: number;
  chatId: string;
  userId: string;
  sender: Sender;
  userText: string;
  priorThread: GuestThreadNode | null;
  lang: Lang;
  onAIStart?: () => void;
};

export type GuestAskOutcome =
  | { kind: "denied" }
  | { kind: "rateLimited"; minutesUntilNextRefill: number }
  | {
      kind: "answered";
      text: string;
      botName: string | null;
      totalTokens: number;
      effects: ToolEffect[];
      persistThread: () => Promise<void>;
    }
  | { kind: "error"; message: string };

export async function guestAskHandler(
  input: GuestAskInput,
): Promise<GuestAskOutcome> {
  const isOwner = input.userId === input.ownerId;
  const isWhitelisted =
    isOwner || (await input.storage.isWhitelisted("users", input.userId));
  if (!isWhitelisted) return { kind: "denied" };

  if (input.userText.trim() === "") return { kind: "denied" };

  const [settings, chatSettings, userTimezone] = await Promise.all([
    getEffectiveSettings(input.storage, input.chatId),
    input.storage.getChatSettings(input.chatId),
    input.storage.getUserTimezone(input.userId),
  ]);
  const botName = chatSettings?.botName?.trim() || null;
  const timezone = userTimezone ?? settings.timezone;

  const skipRateLimit = isOwner && settings.rateLimit.ownerExempt;
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

  const envelope = buildUserEnvelope({
    sender: input.sender,
    quote: null,
    text: input.userText,
  });
  const priorTurns = input.priorThread?.turns.slice(-MAX_REPLY_CHAIN_DEPTH) ?? [];
  const messages: AIMessage[] = [];
  for (const turn of priorTurns) {
    messages.push({ role: "user", content: turn.userQuestion });
    messages.push({ role: "assistant", content: turn.botAnswer });
  }
  messages.push({ role: "user", content: envelope });

  input.onAIStart?.();

  const effects: ToolEffect[] = [];
  let result;
  try {
    result = await input.ai.ask({
      models: settings.models,
      system: buildInstruction(settings.systemPrompt, {
        timezone,
        lang: input.lang,
      }),
      messages,
      tools: getAllTools(),
      providerSort: settings.providerSort,
      toolCallContext: {
        source: "guest",
        chatId: input.chatId,
        userId: input.userId,
        replyToMessageId: null,
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
    };
  }

  if (!skipRateLimit) {
    await input.rateLimiter.deduct(
      input.chatId,
      input.userId,
      result.totalTokens,
    );
  }

  const sanitized = sanitizeHtml(result.text);

  return {
    kind: "answered",
    text: sanitized,
    botName,
    totalTokens: result.totalTokens,
    effects,
    persistThread: async () => {
      const turns = [
        ...priorTurns,
        { userQuestion: envelope, botAnswer: sanitized },
      ].slice(-MAX_REPLY_CHAIN_DEPTH);
      await input.storage.saveGuestThread(input.chatId, {
        chatId: input.chatId,
        turns,
        ts: input.now,
      });
    },
  };
}
