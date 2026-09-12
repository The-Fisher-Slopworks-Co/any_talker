// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { Bot } from "grammy";
import { CHECK_CALLBACK_RE } from "../../checks/callback-data";
import { checksProcessedTotal } from "../../metrics";
import { migrateChatData } from "../../storage/migrate-chat";
import { dropChatMenu } from "../chat-commands";
import { handleCheckCallback } from "../handlers/check-callback";
import { contactHandler } from "../handlers/contact";
import type { BotContext } from "../middleware/lang";
import type { BotRuntime } from "../runtime";

export function registerChatEventListeners(
  bot: Bot<BotContext>,
  rt: BotRuntime,
): void {
  // Authoritative presence tracking: when THIS bot is added to / removed from a
  // group, record or clear its presence so managed siblings can resolve the
  // bare-`/ask` alone-check. Private chats are never tracked.
  bot.on("my_chat_member", async (ctx) => {
    const upd = ctx.myChatMember;
    if (upd.chat.type === "private") return;
    // Narrow on the member object directly so the `restricted` discriminant
    // exposes `is_member`. A left/kicked bot (or a restricted non-member) is
    // absent; everything else counts as present.
    const member = upd.new_chat_member;
    const present =
      member.status === "member" ||
      member.status === "administrator" ||
      member.status === "creator" ||
      (member.status === "restricted" && member.is_member);
    const chatId = String(upd.chat.id);
    const selfId = String(ctx.me.id);
    const now = Date.now();
    try {
      if (present) {
        await rt.deps.storage.presence.record(chatId, selfId, now);
        // The family in this chat just changed and this bot is the one that
        // learned it: re-resolve which of the bots present lists the shared
        // commands here, instead of waiting for the first message.
        await rt.syncChatMenu({
          api: ctx.api,
          chatId,
          selfBotId: selfId,
          nowMs: now,
        });
      } else {
        await rt.deps.storage.presence.remove(chatId, selfId);
        // Gone from the chat: hand back the chat-scoped menu this bot holds
        // there, so it cannot outlive the membership it was resolved for.
        await dropChatMenu({
          api: ctx.api,
          storage: rt.deps.storage,
          chatId,
          selfBotId: selfId,
        });
      }
    } catch (err) {
      console.error("my_chat_member presence update failed:", err);
    }
  });

  // A basic group upgraded to a supergroup gets a brand-new chat id; Telegram
  // announces it with service messages in both chats (`migrate_to_chat_id` in
  // the old group, `migrate_from_chat_id` in the new supergroup — delivery of
  // either alone is possible, so both trigger). Move every chat-scoped record
  // to the new id so the chat keeps its settings, whitelist access, checks,
  // reminders and spend history. The migration is idempotent: the duplicate
  // trigger — and every family bot in the chat receiving its own copy of the
  // service message — all converge on the same end state. The send-time
  // migrate-and-retry in checks/reminders remains the backstop for a missed
  // service message (e.g. the bot was down during the upgrade).
  const runChatMigration = async (oldChatId: string, newChatId: string) => {
    // The supergroup is the same chat under a new id, not a fresh join — claim
    // the new-group alert key so the owner isn't DM'd about a "new" group.
    void rt.deps.storage.observability
      .claimAlert(`new_chat:${newChatId}`, 7 * 24 * 60 * 60)
      .catch(() => {});
    console.warn(
      `[migrate-chat] group upgraded to supergroup: ${oldChatId} -> ${newChatId}`,
    );
    await migrateChatData(rt.deps.storage, oldChatId, newChatId, Date.now());
  };

  bot.on("message:migrate_to_chat_id", async (ctx) => {
    await runChatMigration(
      String(ctx.chat.id),
      String(ctx.message.migrate_to_chat_id),
    );
  });

  bot.on("message:migrate_from_chat_id", async (ctx) => {
    await runChatMigration(
      String(ctx.message.migrate_from_chat_id),
      String(ctx.chat.id),
    );
  });

  bot.on("message:contact", async (ctx) => {
    if (ctx.message.forward_origin) return;
    if (!ctx.from) return;
    const c = ctx.message.contact;

    const outcome = await contactHandler({
      storage: rt.deps.storage,
      ownerId: rt.deps.ownerId,
      now: Date.now(),
      isPrivateChat: ctx.chat?.type === "private",
      fromUserId: String(ctx.from.id),
      contact: {
        user_id: c.user_id,
        first_name: c.first_name,
        last_name: c.last_name,
      },
    });

    switch (outcome.kind) {
      case "ignored":
        return;
      case "noUserId":
        await ctx.reply(ctx.t.bot_contact_no_user_id);
        return;
      case "isOwner":
        await ctx.reply(ctx.t.bot_contact_is_owner);
        return;
      case "alreadyWhitelisted":
        await ctx.reply(ctx.t.bot_contact_already_whitelisted(outcome.label));
        return;
      case "added":
        await ctx.reply(ctx.t.bot_contact_added(outcome.label));
        return;
    }
  });

  bot.callbackQuery(CHECK_CALLBACK_RE, async (ctx) => {
    const checkId = ctx.match[1]!;
    const answer = ctx.match[2] as "yes" | "no";
    const fromUserId = String(ctx.from.id);
    const callbackMessageId = ctx.callbackQuery.message?.message_id;
    if (callbackMessageId === undefined) {
      await ctx.answerCallbackQuery().catch(() => {});
      return;
    }
    const outcome = await handleCheckCallback({
      storage: rt.deps.storage,
      api: ctx.api,
      checkId,
      answer,
      fromUserId,
      callbackMessageId,
    });
    if (outcome.kind === "wrong_user") {
      await ctx
        .answerCallbackQuery({ text: ctx.t.bot_check_wrong_user })
        .catch(() => {});
      return;
    }
    if (outcome.kind === "resolved") {
      checksProcessedTotal.inc({
        outcome: answer === "yes" ? "answered_yes" : "answered_no",
      });
    }
    await ctx.answerCallbackQuery().catch(() => {});
  });
}
