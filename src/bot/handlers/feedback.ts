// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { Storage } from "../../storage/types";
import type { PersonaResolver } from "../../managed-bots/persona";
import type { Lang } from "../../shared/i18n";
import type { ChatType } from "../../shared/types";
import type { FeedbackEntry } from "../../shared/types/feedback";
import { buildInstruction, instructionHash } from "../../ai/instruction";
import { buildThreadSnapshots } from "../feedback-snapshot";
import { checkAccess, type AccessDenyReason } from "../access";

// One message, no dialogue state: the trailing group takes the report whole.
const COMMAND_RE = /^\/feedback(?:@(\w+))?(?:\s+([\s\S]*))?$/i;

// Telegram's own message limit, so a longer report is truncated, not rejected.
export const FEEDBACK_TEXT_MAX = 4096;

// Reports per user per UTC day — the only thing bounding a TTL-less corpus.
export const FEEDBACK_DAILY_MAX = 5;

// Addressed to this bot: bare, or `@`-suffixed with its own username, as
// `/usage` and `/digest` match theirs. Otherwise the report, empty when bare.
// `explicit` says which of the two it was — `/feedback` is a shared command, so
// only a bare one needs the who-acts-on-it gate (`handlesSharedCommand`).
export function matchFeedbackCommand(
  text: string,
  selfUsername: string | undefined,
): { text: string; explicit: boolean } | null {
  const m = COMMAND_RE.exec(text.trim());
  if (!m) return null;
  const addressed = m[1]?.toLowerCase();
  if (addressed !== undefined && addressed !== selfUsername?.toLowerCase()) {
    return null;
  }
  return {
    text: (m[2] ?? "").trim().slice(0, FEEDBACK_TEXT_MAX),
    explicit: addressed !== undefined,
  };
}

export type FeedbackInput = {
  // Unscoped: both stores are global, and the snapshot resolves each thread
  // through the scope its own index entry names.
  storage: Storage;
  resolver: PersonaResolver;
  ownerId: string;
  botId: string | null;
  userId: string;
  chatId: string;
  chatType: ChatType;
  // Only for a message sent as a chat, then equal to `userId`; gate-only.
  senderChatId?: string | null | undefined;
  lang: Lang;
  text: string;
  // The bot message the command replied to, when it was one.
  pointedAt?: { chatId: string; botMsgId: number } | undefined;
  now: number;
  // `getBuildInfo().commit` — which build produced the reported behavior.
  build: string | null;
};

export type FeedbackOutcome =
  | { kind: "recorded"; id: string }
  | { kind: "empty" }
  | { kind: "rateLimited" }
  | { kind: "denied"; reason: AccessDenyReason };

// Stores one report, outside the budget and rate-limit gates: it costs no
// tokens, and putting it behind the gate that broke would make a broken bot
// unreportable.
export async function feedbackHandler(
  input: FeedbackInput,
): Promise<FeedbackOutcome> {
  const { storage, userId, now } = input;
  const scoped = storage.forBot(input.botId);
  const { settings } = await input.resolver(input.chatId);
  // The gate `/ask` applies, silent in the same way: naming it would confirm
  // the command exists to someone who must not fill the corpus anyway.
  const access = await checkAccess({
    storage: scoped,
    ownerId: input.ownerId,
    userId,
    chatId: input.chatId,
    senderChatId: input.senderChatId,
    whitelistEnabled: settings.whitelistEnabled,
  });
  if (!access.allowed) return { kind: "denied", reason: access.reason };
  // A bare `/feedback` is how the command is discovered: nothing is stored, and
  // the day's allowance stays unspent.
  if (input.text === "") return { kind: "empty" };
  // Counted before the snapshot is built, so a rejected submission does not
  // first pay for reading the conversation graph.
  const count = await storage.feedback.bumpDailyCount(userId, now);
  if (count > FEEDBACK_DAILY_MAX) {
    return { kind: "rateLimited" };
  }
  const [userTimezone, facts, threads] = await Promise.all([
    scoped.profile.getTimezone(userId),
    scoped.facts.list(userId),
    // Legitimately empty once every indexed thread has expired.
    buildThreadSnapshots(storage, userId),
  ]);
  // As `runAiTurn` renders it, less the per-turn detail-level section, which
  // `/feedback` has none of — so it matches `run.instr` for a turn that
  // carried no detail level either.
  const systemPrompt = buildInstruction(settings.systemPrompt, {
    timezone: userTimezone ?? settings.timezone,
    lang: input.lang,
    facts,
  });
  const entry: FeedbackEntry = {
    id: crypto.randomUUID(),
    userId,
    chatId: input.chatId,
    chatType: input.chatType,
    botId: input.botId,
    // Guest messages are answered inline off `guest_message` and never reach
    // this handler; the flag is what a future guest path would set.
    isGuest: false,
    lang: input.lang,
    text: input.text,
    createdAt: now,
    ...(input.pointedAt && { pointedAt: input.pointedAt }),
    threads,
    systemPrompt,
    systemPromptHash: instructionHash(systemPrompt),
    build: input.build,
    status: "new",
  };
  await storage.feedback.save(entry);
  return { kind: "recorded", id: entry.id };
}
