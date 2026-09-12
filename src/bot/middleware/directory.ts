// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { MiddlewareFn } from "grammy";
import type { BotRuntime } from "../runtime";
import { shouldRefreshPresence } from "../routing";
import type { BotContext } from "./lang";

export function makeDirectoryMiddleware(
  rt: BotRuntime,
): MiddlewareFn<BotContext> {
  return async (ctx, next) => {
    const now = Date.now();
    const guestMsg = ctx.update.guest_message;
    const from = ctx.from ?? guestMsg?.from;
    if (from && !from.is_bot) {
      void rt.deps.storage.users
        .upsert({
          id: String(from.id),
          firstName: from.first_name ?? null,
          lastName: from.last_name ?? null,
          username: from.username ?? null,
          // Tentative first-seen; storage keeps the stored value when the row
          // already exists, so this only sticks for a genuinely new user.
          firstSeenAt: now,
          lastSeenAt: now,
        })
        .catch((err) => console.error("users.upsert failed:", err));
    }
    const chat = ctx.chat ?? guestMsg?.chat;
    if (chat) {
      const chatRecord = {
        id: String(chat.id),
        type: chat.type,
        title: "title" in chat ? (chat.title ?? null) : null,
        username: "username" in chat ? (chat.username ?? null) : null,
        firstSeenAt: now,
        lastSeenAt: now,
      };
      void rt.deps.storage.chats
        .upsert(chatRecord)
        .then((res) => {
          // First-ever sighting of a non-private chat = a fresh group join.
          if (res.isNew) void rt.alerts.newGroup(ctx.api, chatRecord);
        })
        .catch((err) => console.error("chats.upsert failed:", err));
    }
    if (ctx.chat?.type === "private" && from && !from.is_bot) {
      void rt.scopedStorage.privateChats
        .record(String(from.id))
        .catch((err) => console.error("privateChats.record failed:", err));
    }
    // Refresh this bot's presence in any group it is active in, so managed
    // siblings can tell who shares a chat (drives the bare-`/ask` alone-check).
    // `my_chat_member` is the authoritative add/remove; this activity refresh
    // backfills membership that predates the feature and renews the TTL — but
    // only on genuine activity (see `shouldRefreshPresence`), never on the
    // service/membership burst a bot drains around its own removal, which would
    // otherwise resurrect the presence its removal just cleared.
    if (
      ctx.chat &&
      ctx.chat.type !== "private" &&
      shouldRefreshPresence(ctx.update)
    ) {
      void rt.deps.storage.presence
        .record(String(ctx.chat.id), String(ctx.me.id), now)
        .catch((err) => console.error("presence.record failed:", err));
      // Hung on the same trigger, because that activity is also what tells this
      // bot who else is in the chat: keep its chat-scoped command menu in step
      // with the family actually present there, so a shared command is listed
      // by exactly one of them. A no-op read unless the resolution changed.
      void rt
        .syncChatMenu({
          api: ctx.api,
          chatId: String(ctx.chat.id),
          selfBotId: String(ctx.me.id),
          nowMs: now,
        })
        .catch((err) => console.error("syncChatMenu failed:", err));
    }
    await next();
  };
}
