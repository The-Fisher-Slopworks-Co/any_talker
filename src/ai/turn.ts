// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { Storage } from "../storage/types";
import type { RateLimiter } from "../ratelimit/types";
import type { AIClient, AIMessage } from "./types";
import type { RateLimitConfig } from "../shared/types";
import type { Lang } from "../shared/i18n";
import { recordSpend } from "../spending/record";
import { getAllTools, type ToolCallSource, type ToolEffect } from "./tools/registry";
import {
  buildInstruction,
  detailLevelMultiplier,
  detailLevelReasoningEffort,
  type DetailLevel,
} from "./instruction";

// The single "run one LLM turn" interface shared by the three LLM call sites
// (/ask, guest mode, reminder delivery). It owns the request assembly the three
// used to hand-write — system prompt, tool wiring, the `ToolCallContext`
// literal (including the mutable `effects` array) — the `ai.ask` call, and the
// post-call accounting (owner-exempt token deduction with the detail-level
// multiplier, and the four-ledger spend booking). Callers pass domain inputs
// and get back the answer plus the collected effects; everything about *how*
// the model is invoked and charged lives here, so an accounting or context-shape
// change touches one file.
//
// Deliberately NOT owned here (caller concerns): resolving settings/persona,
// building the message list, the access/budget/rate-limit *gates*, the
// try/catch that maps an `ai.ask` throw onto a caller-specific outcome, and all
// rendering. A thrown `ai.ask` propagates out of `runAiTurn` before any
// accounting runs — exactly as the three call sites behave today.
export type RunAiTurnInput = {
  // Injected services (DI convention — no module-level state, no singletons).
  ai: AIClient;
  rateLimiter: RateLimiter;
  // Used only for the four-ledger spend booking; spend is not `forBot`-scoped,
  // so callers pass whichever storage view they already hold.
  storage: Storage;

  // Model + persona inputs for request assembly.
  models: string[];
  systemPrompt: string;
  rateLimit: RateLimitConfig;

  // Identity / addressing.
  userId: string;
  ownerId: string;
  chatId: string;
  botId: string | null;
  // Tool-call source label and the message the turn replies to (`null` when the
  // turn is not a reply, e.g. guest mode).
  source: ToolCallSource;
  replyToMessageId: number | null;

  // Locale / time.
  timezone: string;
  lang: Lang;
  now: number;

  // The messages sent to the model this turn.
  messages: AIMessage[];

  // Optional: when set, adds the detail-level section to the system prompt,
  // selects the reasoning effort, and scales the token deduction by the
  // configured `wiseMultiplier`. Absent (guest, reminder delivery) means the
  // "short"-equivalent path with no detail section, no reasoning effort, and a
  // multiplier of 1.
  detailLevel?: DetailLevel;
  // Optional user facts surfaced in the system prompt.
  facts?: Array<{ key: string; value: string }>;
  // Optional snapshot of the conversation placed on the tool context so tools
  // (e.g. reminders) can durably capture it. Reminder delivery omits it.
  contextMessages?: AIMessage[];
  // When true, a failed token deduction is swallowed and logged instead of
  // thrown. Reminder delivery needs this: a throw would surface as a transient
  // failure, retrying and re-running the model — a double-spend. /ask and guest
  // do not retry, so they let a deduction failure propagate (default false).
  bestEffortDeduct?: boolean;
};

export type AiTurnResult = {
  text: string;
  totalTokens: number;
  modelId: string | null;
  costUsd: number;
  priced: boolean;
  // The effects tools pushed during the turn (reminders scheduled, settings
  // updated, …). The same array handed to the tool context — callers render or
  // return it. Empty when no effect-producing tool fired.
  effects: ToolEffect[];
};

export async function runAiTurn(input: RunAiTurnInput): Promise<AiTurnResult> {
  const effects: ToolEffect[] = [];

  const result = await input.ai.ask({
    models: input.models,
    system: buildInstruction(input.systemPrompt, {
      timezone: input.timezone,
      lang: input.lang,
      detailLevel: input.detailLevel,
      facts: input.facts,
    }),
    messages: input.messages,
    tools: getAllTools(),
    reasoningEffort: input.detailLevel
      ? detailLevelReasoningEffort(input.detailLevel)
      : undefined,
    toolCallContext: {
      source: input.source,
      chatId: input.chatId,
      userId: input.userId,
      botId: input.botId,
      replyToMessageId: input.replyToMessageId,
      timezone: input.timezone,
      lang: input.lang,
      now: input.now,
      effects,
      contextMessages: input.contextMessages,
    },
  });

  // Token deduction (after the response, so it can overshoot — see the limiter's
  // at-least-one-more-request semantics). Owner-exempt users skip it; the
  // detail-level multiplier scales it (1 when no detail level is set).
  const isOwner = input.userId === input.ownerId;
  const skipDeduction = isOwner && input.rateLimit.ownerExempt;
  if (!skipDeduction) {
    const multiplier = input.detailLevel
      ? detailLevelMultiplier(input.detailLevel, input.rateLimit)
      : 1;
    const deduction = Math.round(result.totalTokens * multiplier);
    const deducting = input.rateLimiter.deduct(input.userId, deduction, input.now);
    if (input.bestEffortDeduct) {
      await deducting.catch((err) =>
        console.error("token deduction failed:", err),
      );
    } else {
      await deducting;
    }
  }

  // Record spend across every ledger (user/chat/global/model) regardless of
  // rate-limit exemption — an exempt owner's usage is still money spent through
  // the bot, and the global total is the kill-switch's source of truth.
  // Best-effort by contract: a storage hiccup on this accounting must not fail
  // an answer already produced.
  const modelId = result.modelId ?? null;
  const costUsd = result.costUsd ?? 0;
  const priced = result.priced ?? true;
  await recordSpend(
    input.storage,
    { userId: input.userId, chatId: input.chatId, modelId, costUsd, priced },
    input.now,
  ).catch((err) => console.error("recording spend failed:", err));

  return {
    text: result.text,
    totalTokens: result.totalTokens,
    modelId,
    costUsd,
    priced,
    effects,
  };
}
