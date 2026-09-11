// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { DetailLevel } from "../../ai/instruction";
import { getBuildInfo } from "../../build-info";
import { digestCommandHandler } from "../handlers/digest";
import { feedbackHandler } from "../handlers/feedback";
import { usageCommandHandler } from "../handlers/usage";
import { resolveSenderIdentity } from "../identity";
import { replyEphemeral } from "../ephemeral";
import type { BotContext } from "../middleware/lang";
import type { BotRuntime } from "../runtime";
import { dispatchAsk } from "./ask";

export async function dispatchTextCommand(
  rt: BotRuntime,
  ctx: BotContext,
  detailLevel: DetailLevel,
  // Every bot extracts the text via `matchAsk` and passes it in, so this never
  // relies on grammY's `ctx.match` (the command filter is unused for asks).
  userText: string,
): Promise<void> {
  const msg = ctx.message;
  if (!msg) return;
  await dispatchAsk(rt, ctx, {
    userText,
    askMessageId: msg.message_id,
    images: [],
    imageFileIds: [],
    audios: [],
    replyToMessage: msg.reply_to_message,
    quote: msg.quote?.text ?? null,
    forwardOrigin: Boolean(msg.forward_origin),
    detailLevel,
  });
}

// Both the main and managed bots parse `/ask(wise)` from the raw text with
// `matchAsk` (not grammY's command filter) so the same reply-aware routing in
// `shouldAnswer` applies to every bot: an explicit `@self` is always answered,
// a bare `/ask` replying to a present family bot's message is answered by THAT
// bot, and a managed bot otherwise answers only in a DM or when alone in a
// group. Dropping the main bot's `bot.command` loses no behavior: `bot.command`
// also fires on channel/business posts, but those populate `ctx.channelPost`/
// `ctx.businessMessage` (not `ctx.message`), and the whole ask flow keys off
// `ctx.message` — like the `message:photo`/`message:voice` handlers — so a
// `/ask` there already no-op'd before this change.
// The owner's on-demand budget digest. Checked before `matchAsk` and handled
// inline (rather than as a second `message:text` listener) because this
// handler doesn't call `next()` — a separate listener registered first would
// swallow every ask.
export async function dispatchDigestCommand(
  rt: BotRuntime,
  ctx: BotContext,
): Promise<void> {
  const from = ctx.from;
  if (!from) return;
  const outcome = await digestCommandHandler({
    storage: rt.deps.storage,
    ownerId: rt.deps.ownerId,
    isPrivateChat: ctx.chat?.type === "private",
    fromUserId: String(from.id),
    lang: ctx.lang,
    nowMs: Date.now(),
  });

  switch (outcome.kind) {
    case "ignored":
      return;
    case "empty":
      await ctx.reply(ctx.t.bot_digest_empty);
      return;
    case "digest":
      // Rich send with the same plain fallback the scheduled digest uses.
      try {
        await ctx.api.sendRichMessage(from.id, {
          markdown: outcome.markdown,
        });
      } catch (err) {
        console.error("digest sendRichMessage failed, sending plain:", err);
        await ctx.reply(outcome.markdown);
      }
      return;
  }
}

// `/usage` — the user's own rate-limit standing, in percent. Handled inline
// alongside `/digest` for the same reason: this listener owns `message:text`
// and doesn't call `next()`.
export async function dispatchUsageCommand(
  rt: BotRuntime,
  ctx: BotContext,
): Promise<void> {
  const from = ctx.from;
  if (!from) return;
  const outcome = await usageCommandHandler({
    storage: rt.deps.storage,
    ownerId: rt.deps.ownerId,
    isPrivateChat: ctx.chat?.type === "private",
    fromUserId: String(from.id),
    lang: ctx.lang,
    nowMs: Date.now(),
  });
  if (outcome.kind === "ignored") return;
  await ctx.reply(outcome.text);
}

// `/feedback <text>` — handled inline alongside `/digest` and `/usage` for the
// same reason: this listener owns `message:text` and does not call `next()`.
export async function dispatchFeedbackCommand(
  rt: BotRuntime,
  ctx: BotContext,
  text: string,
): Promise<void> {
  const msg = ctx.message;
  const chat = ctx.chat;
  if (!msg || !chat) return;
  // Never `ctx.from.id` directly: a message sent as a chat carries a
  // Telegram-wide pseudo-account there (`bot/identity.ts`), and both the record
  // and the daily cap key on the sender.
  const identity = resolveSenderIdentity({
    from: ctx.from,
    sender_chat: ctx.senderChat,
  });
  if (!identity) return;
  const reply = msg.reply_to_message;
  const outcome = await feedbackHandler({
    storage: rt.deps.storage,
    resolver: rt.deps.resolver,
    ownerId: rt.deps.ownerId,
    botId: rt.botId,
    userId: identity.userId,
    chatId: String(chat.id),
    chatType: chat.type,
    senderChatId: identity.senderChatId,
    lang: ctx.lang,
    text,
    // Any bot's message is a valid pointer — a group's graph is family-wide.
    pointedAt:
      reply?.from?.is_bot === true
        ? { chatId: String(chat.id), botMsgId: reply.message_id }
        : undefined,
    now: Date.now(),
    build: (await getBuildInfo()).commit,
  });

  // Silent toward the chat, as `/ask` is: the gate's answer is a log line.
  if (outcome.kind === "denied") {
    rt.logAccessDenied({
      chat_id: chat.id,
      user_id: identity.userId,
      reason: outcome.reason,
      source: "feedback",
    });
    return;
  }
  // Addressed to the human who typed it even when the record is filed under the
  // chat they spoke as: an ephemeral message names a user id, which a chat has
  // none of. No `from` means nobody to answer; the record still stands.
  const receiver = ctx.from?.id;
  if (receiver === undefined) return;
  const answer =
    outcome.kind === "empty"
      ? ctx.t.bot_feedback_usage
      : outcome.kind === "rateLimited"
        ? ctx.t.bot_feedback_limited
        : ctx.t.bot_feedback_recorded;
  await replyEphemeral(ctx, answer, receiver);
}
