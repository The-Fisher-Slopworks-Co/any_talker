// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { Storage } from "../../storage/types";
import type { RateLimiter } from "../../ratelimit/types";
import type { BudgetGuard } from "../../budget/types";
import type { AIClient, AIMessage } from "../../ai/types";
import type {
  BudgetDenyReason,
  Settings,
  ToolCallRecord,
  WindowKind,
} from "../../shared/types";
import type { Lang } from "../../shared/i18n";
import type { DetailLevel } from "../../ai/instruction";
import type { ToolCallSource, ToolEffect } from "../../ai/tools/registry";
import { recordDenial } from "../../spending/record";
import { runAiTurn } from "../../ai/turn";

// The gates-plus-call half of a chat turn, shared by /ask and guest mode: the
// budget gate, the token rate limit, and the `runAiTurn` invocation with its
// error and empty-answer mapping. Everything above it (access gate, emptiness
// check, persona resolution) and everything below it (persisting the turn,
// rendering) stays with each handler, as does the message list — built here
// through `buildMessages` so the two message shapes remain each handler's own.
export type GatedTurnInput = {
  ai: AIClient;
  rateLimiter: RateLimiter;
  budgetGuard: BudgetGuard;
  // The caller's `forBot`-scoped storage view.
  storage: Storage;
  settings: Settings;

  userId: string;
  ownerId: string;
  chatId: string;
  botId: string | null;
  source: ToolCallSource;
  replyToMessageId: number | null;
  // Absent (guest mode) means the "short"-equivalent path — see `runAiTurn`.
  detailLevel?: DetailLevel | undefined;

  timezone: string;
  lang: Lang;
  now: number;

  // Called only once both gates pass: assembling the context reads storage and
  // re-downloads chain images, work a denied turn must not do.
  buildMessages: () => Promise<AIMessage[]>;
  onAIStart?: (() => void) | undefined;
};

export type GatedTurnResult =
  | { kind: "budgetLimited"; reason: BudgetDenyReason }
  | { kind: "rateLimited"; limitedBy: WindowKind; msUntilReset: number }
  // `toolCalls` is empty when `runAiTurn` threw (nothing ran to completion) and
  // filled on the empty-answer path, so a caller that owns a conversation
  // history can still persist what the tools returned.
  | { kind: "error"; message: string; toolCalls: ToolCallRecord[] }
  | {
      kind: "answered";
      text: string;
      totalTokens: number;
      effects: ToolEffect[];
      toolCalls: ToolCallRecord[];
    };

export async function runGatedAiTurn(
  input: GatedTurnInput,
): Promise<GatedTurnResult> {
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
    input.settings.budget,
  );
  if (!budgetVerdict.allowed) {
    recordDenial(input.storage, input.userId, input.now);
    return { kind: "budgetLimited", reason: budgetVerdict.reason };
  }

  const skipRateLimit = isOwner && input.settings.rateLimit.ownerExempt;
  if (!skipRateLimit) {
    const r = await input.rateLimiter.check(
      input.userId,
      input.settings.rateLimit,
      input.now,
    );
    if (!r.allowed) {
      recordDenial(input.storage, input.userId, input.now);
      return {
        kind: "rateLimited",
        limitedBy: r.limitedBy,
        msUntilReset: r.msUntilReset,
      };
    }
  }

  const messages = await input.buildMessages();

  input.onAIStart?.();

  // Surface the user's remembered facts in the system prompt so the model can
  // use them without having to call list_facts on every turn.
  const facts = await input.storage.facts.list(input.userId);

  // Assemble the request, run the model, and do the post-call accounting
  // (owner-exempt token deduction with the detail-level multiplier + the
  // four-ledger spend booking) in one place shared with reminder delivery. A
  // thrown `ai.ask` propagates before any accounting runs.
  let result;
  try {
    result = await runAiTurn({
      ai: input.ai,
      rateLimiter: input.rateLimiter,
      storage: input.storage,
      models: input.settings.models,
      systemPrompt: input.settings.systemPrompt,
      rateLimit: input.settings.rateLimit,
      routing: {
        providerSort: input.settings.providerSort,
        provider: input.settings.provider,
        serviceTier: input.settings.serviceTier,
      },
      userId: input.userId,
      ownerId: input.ownerId,
      chatId: input.chatId,
      botId: input.botId,
      source: input.source,
      replyToMessageId: input.replyToMessageId,
      timezone: input.timezone,
      lang: input.lang,
      now: input.now,
      messages,
      ...(input.detailLevel && { detailLevel: input.detailLevel }),
      facts,
      contextMessages: messages,
    });
  } catch (err) {
    return {
      kind: "error",
      message: err instanceof Error ? err.message : String(err),
      toolCalls: [],
    };
  }

  // A model can legitimately finish with no text (e.g. an output-token cap hit
  // mid-reasoning). Surface it as an error turn — Telegram rejects empty
  // messages, so trying to send it would only crash the dispatcher.
  if (result.text.trim() === "") {
    return {
      kind: "error",
      message: "AI returned an empty answer",
      toolCalls: result.toolCalls,
    };
  }

  return {
    kind: "answered",
    text: result.text,
    totalTokens: result.totalTokens,
    effects: result.effects,
    toolCalls: result.toolCalls,
  };
}
