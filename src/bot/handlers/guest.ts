// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { Storage } from "../../storage/types";
import type { RateLimiter } from "../../ratelimit/types";
import type { BudgetGuard } from "../../budget/types";
import type { AIClient } from "../../ai/types";
import { recordDenial } from "../../spending/record";
import { runAiTurn } from "../../ai/turn";
import {
  buildReplyFallbackMessage,
  buildUserEnvelope,
  loadChainImages,
  withMedia,
  type ReplyTarget,
  type Sender,
} from "../context-builder";
import type { PersonaResolver } from "../../managed-bots/persona";
import type { ToolEffect } from "../../ai/tools/registry";
import type { AIMessage } from "../../ai/types";
import {
  MAX_REPLY_CHAIN_DEPTH,
  type GuestThreadNode,
  type WindowKind,
  type BudgetDenyReason,
} from "../../shared/types";
import type { Lang } from "../../shared/i18n";
import type { VideoClip } from "../video";

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
  // Whole clips, sent when the answering model advertises video input. Empty in
  // frames mode, where the clip already arrived as `images` + `audios`.
  videos?: VideoClip[];
  // Describes media the parts alone don't explain — video frames (see
  // `bot/video.ts`). Goes into the user envelope, so it is persisted too.
  attachments?: string;
  imageFileIds: string[];
  replyImageFileIds: string[];
  // The message the guest query replied to. Guest threads only capture this
  // bot's own answers, so a reply to anything else (another user's message, a
  // bot answer whose stored thread has expired, or a bot answer that belongs
  // to a different thread than the replier's own — see `threadMatchesReply`)
  // reaches the model through /ask's unknown-reply fallback
  // (`buildReplyFallbackMessage`).
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

// Rendering strips markdown syntax and adds chrome (bot-name prefix, effects
// block, details summary), so the comparison keeps only letters and digits and
// looks for the stored answer's prefix inside the rendered reply text.
const THREAD_MATCH_PREFIX_CHARS = 64;

const normalizeForMatch = (s: string): string =>
  s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

// Whether the replied-to message is recognizably the thread's own last answer.
//
// A guest thread is keyed by the guest DM — one thread per user, not per
// message — while a reply can target ANY of this bot's messages in the group,
// including an answer given to someone else. Telegram gives no id to join on
// (`answerGuestQuery` never returns the posted message's id), so the replied-to
// text is the only link: continue the thread only when it matches, otherwise
// the caller falls back to quoting the replied-to message verbatim.
export function threadMatchesReply(
  thread: GuestThreadNode,
  replyText: string | null,
): boolean {
  const lastAnswer = thread.turns[thread.turns.length - 1]?.botAnswer;
  if (lastAnswer === undefined || replyText === null) return false;
  const answer = normalizeForMatch(lastAnswer).slice(
    0,
    THREAD_MATCH_PREFIX_CHARS,
  );
  // Nothing verifiable survives normalization (emoji-only answer, …): keep the
  // thread rather than silently dropping the user's own context.
  if (answer === "") return true;
  return normalizeForMatch(replyText).includes(answer);
}

export async function guestAskHandler(
  input: GuestAskInput,
): Promise<GuestAskOutcome> {
  // Per-character storage view (scoped facts, guest threads, private-chat flag);
  // forBot(null) is the main bot.
  const storage = input.storage.forBot(input.botId ?? null);

  const isOwner = input.userId === input.ownerId;

  // Nothing to answer about — no text, no replied-to message, no media. The
  // same emptiness check as /ask's "usage" outcome; guest queries have no
  // usage hint to send, so it stays a silent deny.
  const audios = input.audios ?? [];
  const videos = input.videos ?? [];
  if (
    input.userText.trim() === "" &&
    input.replyTarget === null &&
    input.images.length === 0 &&
    audios.length === 0 &&
    videos.length === 0
  ) {
    return { kind: "denied" };
  }

  const [{ settings, botName }, userTimezone] = await Promise.all([
    input.resolver(input.chatId),
    storage.getUserTimezone(input.userId),
  ]);
  const timezone = userTimezone ?? settings.timezone;

  // Access gate: owner always passes; otherwise the user whitelist is consulted
  // only while `whitelistEnabled` (guest queries have no chat membership, so
  // only the user list applies). The budget guard is the safety net when off.
  if (settings.whitelistEnabled && !isOwner) {
    const isWhitelisted = await storage.isWhitelisted("users", input.userId);
    if (!isWhitelisted) return { kind: "denied" };
  }

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

  // One envelope, used both for the request and for the persisted thread turn,
  // so the stored text is byte-identical to what the model saw — a prefix that
  // still matches on the next turn is what keeps the prompt cache warm.
  const envelope = buildUserEnvelope({
    sender: input.sender,
    quote: input.quote,
    text: input.userText,
    attachments: input.attachments,
    sentAt: { ms: input.now, timezone },
  });
  // Continue the stored thread only when the reply verifiably targets its
  // last answer; a mismatched thread (reply to a bot answer from someone
  // else's conversation) is dropped so the replied-to message itself becomes
  // the context via the fallback below. Without a replyTarget there is
  // nothing to check against, so the thread is trusted as-is.
  const priorThread =
    input.priorThread !== null &&
    input.replyTarget !== null &&
    !threadMatchesReply(input.priorThread, input.replyTarget.text)
      ? null
      : input.priorThread;
  const priorTurns = priorThread?.turns.slice(-MAX_REPLY_CHAIN_DEPTH) ?? [];
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
  if (input.images.length > 0 || audios.length > 0 || videos.length > 0) {
    messages.push({
      role: "user",
      content: withMedia(envelope, input.images, audios, videos),
    });
  } else {
    messages.push({ role: "user", content: envelope });
  }

  input.onAIStart?.();

  const facts = await storage.listUserFacts(input.userId);

  // Assemble the request, run the model, and do the post-call accounting in the
  // shared turn runner. Guest queries are always single-turn "short" asks (no
  // /askwise), so no detail level is passed — the deduction is the raw token
  // total (multiplier 1) and the system prompt carries no detail-level section.
  let result;
  try {
    result = await runAiTurn({
      ai: input.ai,
      rateLimiter: input.rateLimiter,
      storage,
      models: settings.models,
      systemPrompt: settings.systemPrompt,
      rateLimit: settings.rateLimit,
      routing: {
        providerSort: settings.providerSort,
        provider: settings.provider,
        serviceTier: settings.serviceTier,
      },
      userId: input.userId,
      ownerId: input.ownerId,
      chatId: input.chatId,
      botId: input.botId ?? null,
      source: "guest",
      replyToMessageId: null,
      timezone,
      lang: input.lang,
      now: input.now,
      messages,
      facts,
      contextMessages: messages,
    });
  } catch (err) {
    return {
      kind: "error",
      message: err instanceof Error ? err.message : String(err),
    };
  }

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
    effects: result.effects,
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
