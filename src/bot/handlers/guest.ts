// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { Storage } from "../../storage/types";
import type { RateLimiter } from "../../ratelimit/types";
import type { BudgetGuard } from "../../budget/types";
import type { AIClient } from "../../ai/types";
import { recordSpend, recordDenial } from "../../spending/record";
import {
  buildReplyFallbackMessage,
  buildUserEnvelope,
  loadChainImages,
  withMedia,
  type ReplyTarget,
  type Sender,
} from "../context-builder";
import type { PersonaResolver } from "../../managed-bots/persona";
import { getAllTools, type ToolEffect } from "../../ai/tools/registry";
import { buildInstruction } from "../../ai/instruction";
import type { AIMessage } from "../../ai/types";
import {
  MAX_REPLY_CHAIN_DEPTH,
  type GuestThreadNode,
  type WindowKind,
  type BudgetDenyReason,
} from "../../shared/types";
import type { Lang } from "../../shared/i18n";

export type GuestAskInput = {
  storage: Storage;
  rateLimiter: RateLimiter;
  budgetGuard: BudgetGuard;
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
  quote: string | null;
  images: Uint8Array[];
  audios?: Uint8Array[];
  imageFileIds: string[];
  replyImageFileIds: string[];
  // The message the guest query replied to. Guest threads only capture this
  // bot's own answers, so a reply to anything else (another user's message, or
  // a bot answer whose stored thread has expired) reaches the model through
  // /ask's unknown-reply fallback (`buildReplyFallbackMessage`).
  replyTarget: ReplyTarget | null;
  priorThread: GuestThreadNode | null;
  lang: Lang;
  onAIStart?: () => void;
  fetchPhoto?: (fileId: string) => Promise<Uint8Array | null>;
};

export type GuestAskOutcome =
  | { kind: "denied" }
  | { kind: "budgetLimited"; reason: BudgetDenyReason }
  | { kind: "rateLimited"; limitedBy: WindowKind; msUntilReset: number }
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
  const isWhitelisted = isOwner
    ? true
    : await storage.isWhitelisted("users", input.userId);
  if (!isWhitelisted) return { kind: "denied" };

  // Nothing to answer about — no text, no replied-to message, no media. The
  // same emptiness check as /ask's "usage" outcome; guest queries have no
  // usage hint to send, so it stays a silent deny.
  const audios = input.audios ?? [];
  if (
    input.userText.trim() === "" &&
    input.replyTarget === null &&
    input.images.length === 0 &&
    audios.length === 0
  ) {
    return { kind: "denied" };
  }

  const [{ settings, botName }, userTimezone] = await Promise.all([
    input.resolver(input.chatId),
    storage.getUserTimezone(input.userId),
  ]);
  const timezone = userTimezone ?? settings.timezone;

  // Hard USD budget gate (money), before the token rate limit (fairness).
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
    return { kind: "budgetLimited", reason: budgetVerdict.reason };
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
      };
    }
  }

  const envelope = buildUserEnvelope({
    sender: input.sender,
    quote: input.quote,
    text: input.userText,
  });
  const priorTurns = input.priorThread?.turns.slice(-MAX_REPLY_CHAIN_DEPTH) ?? [];
  const messages: AIMessage[] = [];
  for (const turn of priorTurns) {
    const chainImages = await loadChainImages(turn.userImageFileIds, input.fetchPhoto);
    if (chainImages.length > 0) {
      messages.push({
        role: "user",
        content: withMedia(turn.userQuestion, chainImages, []),
      });
    } else {
      messages.push({ role: "user", content: turn.userQuestion });
    }
    messages.push({ role: "assistant", content: turn.botAnswer });
  }
  // A stored thread already contains the replied-to bot answer; the raw
  // replied-to message only fills in when there is no thread to speak for it.
  if (priorTurns.length === 0 && input.replyTarget) {
    messages.push(buildReplyFallbackMessage(input.replyTarget));
  }
  if (input.images.length > 0 || audios.length > 0) {
    messages.push({
      role: "user",
      content: withMedia(envelope, input.images, audios),
    });
  } else {
    messages.push({ role: "user", content: envelope });
  }

  input.onAIStart?.();

  const facts = await storage.listUserFacts(input.userId);

  const effects: ToolEffect[] = [];
  let result;
  try {
    result = await input.ai.ask({
      models: settings.models,
      system: buildInstruction(settings.systemPrompt, {
        timezone,
        lang: input.lang,
        facts,
      }),
      messages,
      tools: getAllTools(),
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
    // Guest queries are always single-turn "short" asks (no /askwise), so the
    // raw token total is the deduction — same as the main path with multiplier 1.
    await input.rateLimiter.deduct(input.userId, result.totalTokens, input.now);
  }

  // Record spend across every ledger (user/chat/global/model) regardless of
  // rate-limit exemption — the global total is the kill-switch's source of
  // truth. Best-effort: a storage hiccup must not fail an answer already made.
  await recordSpend(
    storage,
    {
      userId: input.userId,
      chatId: input.chatId,
      modelId: result.modelId ?? null,
      costUsd: result.costUsd ?? 0,
      priced: result.priced ?? true,
    },
    input.now,
  ).catch((err) => console.error("recording spend failed:", err));

  // A model can legitimately finish with no text (e.g. an output-token cap hit
  // mid-reasoning). Surface it as an error turn — Telegram rejects empty
  // messages, so trying to send it would only crash the dispatcher.
  if (result.text.trim() === "") {
    return { kind: "error", message: "AI returned an empty answer" };
  }

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
      const allImageFileIds = [
        ...input.imageFileIds,
        ...input.replyImageFileIds,
      ];
      const turns = [
        ...priorTurns,
        {
          userQuestion: envelope,
          botAnswer: body,
          userImageFileIds:
            allImageFileIds.length > 0 ? allImageFileIds : undefined,
        },
      ].slice(-MAX_REPLY_CHAIN_DEPTH);
      await storage.saveGuestThread(input.chatId, {
        chatId: input.chatId,
        turns,
        ts: input.now,
      });
    },
  };
}
