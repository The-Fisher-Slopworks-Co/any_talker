// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { Storage } from "../../storage/types";
import type { RateLimiter } from "../../ratelimit/types";
import type { AIClient } from "../../ai/types";
import { buildUserEnvelope, type Sender } from "../context-builder";
import type { PersonaResolver } from "../../managed-bots/persona";
import { getAllTools, type ToolEffect } from "../../ai/tools/registry";
import { buildInstruction } from "../../ai/instruction";
import type { AIMessage } from "../../ai/types";
import { MAX_REPLY_CHAIN_DEPTH, type GuestThreadNode } from "../../shared/types";
import type { Lang } from "../../shared/i18n";

export type GuestAskInput = {
  storage: Storage;
  rateLimiter: RateLimiter;
  ai: AIClient;
  resolver: PersonaResolver;
  // null/undefined = main bot, a managed bot's id otherwise.
  botId?: string | null;
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
      expandableThreshold: number;
      persistThread: () => Promise<void>;
    }
  | { kind: "error"; message: string };

export async function guestAskHandler(
  input: GuestAskInput,
): Promise<GuestAskOutcome> {
  // Per-character storage view (scoped facts, guest threads, private-chat flag);
  // forBot(null) is the main bot.
  const storage = input.storage.forBot(input.botId ?? null);

  const isOwner = input.userId === input.ownerId;
  const [isWhitelisted, byokKey, byokModels] = await Promise.all([
    isOwner
      ? Promise.resolve(true)
      : storage.isWhitelisted("users", input.userId),
    storage.getUserOpenrouterKey(input.userId),
    storage.getUserOpenrouterModels(input.userId),
  ]);
  if (!isWhitelisted && byokKey === null) return { kind: "denied" };

  if (input.userText.trim() === "") return { kind: "denied" };

  const [{ settings, botName }, userTimezone] = await Promise.all([
    input.resolver(input.chatId),
    storage.getUserTimezone(input.userId),
  ]);
  const timezone = userTimezone ?? settings.timezone;

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
        facts,
      }),
      messages,
      tools: getAllTools(),
      providerSort: settings.providerSort,
      provider: settings.provider,
      serviceTier: settings.serviceTier,
      apiKey: byokKey,
      toolCallContext: {
        source: "guest",
        chatId: input.chatId,
        userId: input.userId,
        botId: input.botId ?? null,
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

  // Record spend regardless of rate-limit exemption — owner and BYOK usage is
  // still money this user spent through the bot. Best-effort: a storage hiccup
  // on this display-only accounting must not fail an answer already produced.
  await storage
    .addUserSpend(input.userId, result.costUsd ?? 0, input.now)
    .catch((err) => console.error("recording user spend failed:", err));

  // Sent verbatim as Rich Markdown (parsed server-side by Telegram) — no HTML
  // sanitization. The same text is persisted as the guest-thread context.
  const body = result.text;

  return {
    kind: "answered",
    text: body,
    botName,
    totalTokens: result.totalTokens,
    effects,
    expandableThreshold: settings.expandableBlockquoteThreshold,
    persistThread: async () => {
      const turns = [
        ...priorTurns,
        { userQuestion: envelope, botAnswer: body },
      ].slice(-MAX_REPLY_CHAIN_DEPTH);
      await storage.saveGuestThread(input.chatId, {
        chatId: input.chatId,
        turns,
        ts: input.now,
      });
    },
  };
}
