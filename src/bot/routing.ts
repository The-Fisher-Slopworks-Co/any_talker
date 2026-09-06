// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { Message, Update } from "grammy/types";
import type { Storage } from "../storage/types";
import type { DetailLevel } from "../ai/instruction";
import type { BotContext } from "./middleware/lang";

// `/ask`/`/askwise`, an optional `@username` (group 2, without the @), and the
// optional text (group 3). The `g` flag is intentionally absent so `.match`
// stays stateless and the instance is reusable.
const ASK_RE = /^\/(ask|askwise)(?:@(\w+))?(?:\s+([\s\S]*))?$/i;

const COMMAND_TO_DETAIL: Record<string, DetailLevel> = {
  ask: "short",
  askwise: "wise",
};

export type AskMatch = {
  detailLevel: DetailLevel;
  userText: string;
  // True when the command explicitly mentioned this bot (`/ask@self`); false for
  // a bare `/ask`. The caller decides whether a bare ask is answered (see
  // `askGate`) — parsing stays pure and stateless.
  explicit: boolean;
};

// Parse an `/ask(wise)` command or media caption and decide whether it is even
// addressed to THIS bot. Matching is done against the bot's LIVE `ctx.me.username`
// so it can't go stale: a `@mention` to a *different* bot returns null (this is
// what stops the main bot from stealing a `/ask@CharacterBot` photo caption). A
// bare `/ask` or an explicit `@self` both return a match; the `explicit` flag
// distinguishes them so the caller can gate bare asks.
export function matchAsk(
  raw: string,
  selfUsername: string | undefined,
): AskMatch | null {
  const m = raw.match(ASK_RE);
  if (!m) return null;
  const mention = m[2];
  if (
    mention &&
    (!selfUsername || mention.toLowerCase() !== selfUsername.toLowerCase())
  ) {
    return null;
  }
  return {
    detailLevel: COMMAND_TO_DETAIL[m[1]!.toLowerCase()] ?? "short",
    userText: (m[3] ?? "").trim(),
    explicit: mention !== undefined,
  };
}

// How long a recorded presence entry is trusted without a refresh. Presence is
// refreshed on every group update a bot processes and on membership changes, so
// this TTL only bounds staleness when a bot leaves a chat while the app is
// offline (its `my_chat_member` is missed) — past it, the entry reads as absent.
export const BOT_PRESENCE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type AskDecision = "answer" | "check-alone" | "skip";

// Where the message a bare `/ask` is replying to was sent from, relative to this
// bot's family (see `classifyReplyTarget`): this bot's own message ("self"), a
// *present* sibling family bot's message ("sibling" — the reply is routed to
// that bot), or anything else ("other": a human, an unrelated bot, no reply, or
// a family bot that is NOT currently in this chat).
export type ReplyRouting = "self" | "sibling" | "other";

// Decide whether a parsed ask should be answered, from routing mode + chat type
// + who (if anyone) the ask replies to:
//   - an explicit `@self` mention is always answered;
//   - a bare `/ask` replying to a present family bot's message is routed to THAT
//     bot — the replied-to bot answers ("self"), every other bot defers
//     ("sibling" ⇒ "skip"); this stops the main bot from stealing a bare `/ask`
//     aimed at a character by replying to that character's message;
//   - otherwise the main bot (`requireMention === false`) answers a bare `/ask`;
//   - a managed bot answers a bare `/ask` in its DM (it is inherently alone),
//     and in a group only if it is the sole family bot there — which the caller
//     resolves via presence ("check-alone").
export function askGate(
  match: AskMatch,
  requireMention: boolean,
  chatType: string | undefined,
  reply: ReplyRouting,
): AskDecision {
  if (match.explicit) return "answer";
  if (reply === "self") return "answer";
  if (reply === "sibling") return "skip";
  if (!requireMention) return "answer";
  if (chatType === "private") return "answer";
  return "check-alone";
}

// Classify the sender of the message a bare `/ask` is replying to, so the ask
// can be routed to the bot the user addressed. `siblingBotIds` are the OTHER
// family bots (for the main bot: the managed bots; for a managed bot: the main
// bot + every other managed bot); this bot's own id is matched separately.
//
// A reply is only "sibling" when that family bot is *actually present in this
// chat* (`isSiblingPresent`) — a family bot that has left, was removed, or is
// down never receives the update, so deferring to it would leave the ask
// unanswered. Such an absent sibling (and any human / unrelated bot / no reply)
// is "other", which falls back to normal routing so the main bot still answers.
// `isSiblingPresent` is only consulted for ids in `siblingBotIds`; "self" is
// always present (this bot just received the update).
export function classifyReplyTarget(
  replyFromId: number | undefined,
  selfId: number,
  siblingBotIds: string[],
  isSiblingPresent: (botId: string) => boolean,
): ReplyRouting {
  if (replyFromId === undefined) return "other";
  const id = String(replyFromId);
  if (id === String(selfId)) return "self";
  if (siblingBotIds.includes(id) && isSiblingPresent(id)) return "sibling";
  return "other";
}

// Whether a recorded presence timestamp is still fresh (a bot was seen within
// the TTL). `seenMs === undefined` — no record at all — is never fresh. Shared by
// the alone-check (`computeAlone`) and the reply-routing presence probe in
// `shouldAnswer` so both read "present in this chat" by exactly the same rule.
export function isPresenceFresh(
  seenMs: number | undefined,
  nowMs: number,
  ttlMs: number,
): boolean {
  return seenMs !== undefined && nowMs - seenMs <= ttlMs;
}

// A managed bot is "alone" in a chat when none of its sibling family bots (the
// main bot + other managed bots) have a fresh presence record there.
export function computeAlone(
  siblingIds: string[],
  presence: Record<string, number>,
  nowMs: number,
  ttlMs: number,
): boolean {
  return !siblingIds.some((id) => isPresenceFresh(presence[id], nowMs, ttlMs));
}

// Message fields that carry genuine user content. A Telegram *service* message
// (member joins/leaves, pins, migrations, …) has none of them. Missing an exotic
// content type only makes presence refresh slightly conservative; it can never
// reintroduce the bug below.
const MESSAGE_CONTENT_KEYS = [
  "text",
  "animation",
  "audio",
  "document",
  "photo",
  "sticker",
  "story",
  "video",
  "video_note",
  "voice",
  "contact",
  "dice",
  "game",
  "poll",
  "venue",
  "location",
  "invoice",
] as const;

function isContentMessage(message: Message | undefined): boolean {
  if (!message) return false;
  const fields = message as unknown as Record<string, unknown>;
  return MESSAGE_CONTENT_KEYS.some((key) => fields[key] !== undefined);
}

// Whether an incoming update is ordinary activity that should refresh this bot's
// group presence (TTL renewal + pre-feature backfill). It deliberately ignores:
//   - `my_chat_member` — membership is owned authoritatively by its handler
//     (which records on join), so refreshing here is redundant and racy;
//   - service messages (no content) — including the `left_chat_member` broadcast
//     of THIS bot's own removal.
// Without this, a bot draining the burst of updates around its own removal would
// re-`presence.record` the presence its `my_chat_member` handler just cleared,
// so a managed sibling would keep seeing it as "present" and stay silent on a
// bare `/ask` until the 7-day TTL lapsed.
export function shouldRefreshPresence(update: Update): boolean {
  if (update.my_chat_member) return false;
  if (update.callback_query) return true;
  return isContentMessage(update.message ?? update.edited_message);
}

// Whether to act on a matched ask. The chat's family-bot presence map is
// fetched once and reused for both the reply routing and the alone-check:
//   - a bare `/ask` replying to a *present* family bot's message is routed to
//     that bot (the replied-to bot answers, the others defer) — a reply to an
//     absent family bot falls back to normal routing so it is never left
//     unanswered;
//   - otherwise a managed bot's bare ask in a group is gated on being the only
//     family bot present, and everything else answers outright.
//
// Two deliberately *opposite* biases on a storage error / no presence data,
// because the failure modes they guard differ: reply routing fails OPEN (an
// unknown sibling reads as absent ⇒ "other" ⇒ the main bot still answers, so a
// reply can't go silent), while the alone-check fails CLOSED (treat as NOT
// alone ⇒ a managed bot stays quiet, so it can't double-answer the main bot).
export function makeShouldAnswer(args: {
  storage: Storage;
  requireMention: boolean;
  siblingBotIds?: (() => string[]) | undefined;
}): (
  ctx: BotContext,
  match: AskMatch,
  replyToMessage: Message | undefined,
) => Promise<boolean> {
  return async (
    ctx: BotContext,
    match: AskMatch,
    replyToMessage: Message | undefined,
  ): Promise<boolean> => {
    const chatId = ctx.chat?.id;
    const siblings = args.siblingBotIds?.() ?? [];

    // Fetch presence once; null distinguishes "couldn't read" (fail-closed for
    // the alone-check) from a successfully-read empty map.
    let presence: Record<string, number> | null = null;
    if (chatId !== undefined) {
      try {
        presence = await args.storage.presence.get(String(chatId));
      } catch (err) {
        console.error("presence.get failed:", err);
      }
    }
    const now = Date.now();
    const isSiblingPresent = (id: string): boolean =>
      isPresenceFresh(presence?.[id], now, BOT_PRESENCE_TTL_MS);

    const reply = classifyReplyTarget(
      replyToMessage?.from?.id,
      ctx.me.id,
      siblings,
      isSiblingPresent,
    );
    const decision = askGate(match, args.requireMention, ctx.chat?.type, reply);
    if (decision === "answer") return true;
    if (decision === "skip") return false;

    // check-alone: a managed bot answers only when no sibling is present.
    if (chatId === undefined) return false;
    if (siblings.length === 0) return true;
    if (presence === null) return false; // fail-closed: couldn't read presence
    return computeAlone(siblings, presence, now, BOT_PRESENCE_TTL_MS);
  };
}
