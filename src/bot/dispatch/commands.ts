// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { DetailLevel } from "../../ai/instruction";
import { digestCommandHandler } from "../handlers/digest";
import { usageCommandHandler } from "../handlers/usage";
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
