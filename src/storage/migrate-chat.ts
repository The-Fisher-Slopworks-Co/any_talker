// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { Storage } from "./types";
import type { Chat } from "../shared/types";

// Moves every chat-scoped record from a retired group id to its supergroup
// successor, so an upgraded chat keeps its settings, whitelist access, checks,
// reminders, spend history, directory row and bot presence. Triggered by the
// Telegram `migrate_to_chat_id` / `migrate_from_chat_id` service messages (see
// `bot/index.ts`), with the send-time migrate-and-retry in checks/reminders as
// the backstop when both service messages were missed.
//
// Every family bot in the chat receives its own copy of the service message,
// so this runs concurrently with itself: each step is idempotent (re-running
// converges on the same end state), and the one non-idempotent piece — summing
// spend buckets — is atomic inside `moveChatSpend`. A failing step is logged
// and skipped rather than aborting the rest, so one unavailable entity can't
// hold the whole chat's data hostage.
//
// Deliberately NOT migrated:
//   - conversation nodes and album buffers — they are keyed by message id, and
//     the old group and the new supergroup have unrelated message-id
//     sequences, so moving them verbatim could attach a stale reply chain to
//     an unrelated new message. A reply to a pre-migration message falls back
//     to the unknown-reply path (the replied-to content is quoted as context),
//     and the records expire with their 30-day TTL anyway;
//   - guest threads — guest chats are business DMs; their ids never migrate;
//   - user-keyed data (facts, attributes, usage, user spend) — unaffected by a
//     chat id change.
export async function migrateChatData(
  storage: Storage,
  oldChatId: string,
  newChatId: string,
  nowMs: number,
): Promise<void> {
  if (oldChatId === newChatId) return;

  const steps: Array<[name: string, run: () => Promise<void>]> = [
    ["chat_settings", () => migrateSettings(storage, oldChatId, newChatId)],
    ["whitelist", () => migrateWhitelist(storage, oldChatId, newChatId)],
    ["directory", () => migrateDirectory(storage, oldChatId, newChatId)],
    ["checks", () => migrateChecks(storage, oldChatId, newChatId)],
    ["reminders", () => migrateReminders(storage, oldChatId, newChatId)],
    ["presence", () => migratePresence(storage, oldChatId, newChatId)],
    ["spend", () => storage.moveChatSpend(oldChatId, newChatId, nowMs)],
  ];
  for (const [name, run] of steps) {
    try {
      await run();
    } catch (err) {
      console.error(
        `[migrate-chat] ${name} failed ${oldChatId} -> ${newChatId}:`,
        err,
      );
    }
  }
}

async function migrateSettings(
  storage: Storage,
  oldChatId: string,
  newChatId: string,
): Promise<void> {
  const old = await storage.getChatSettings(oldChatId);
  if (!old) return;
  // Anything already written under the new id (a concurrent admin edit) wins
  // over the migrated values; saving `{}` deletes the old key.
  const existing = await storage.getChatSettings(newChatId);
  await storage.saveChatSettings(newChatId, { ...old, ...existing });
  await storage.saveChatSettings(oldChatId, {});
}

async function migrateWhitelist(
  storage: Storage,
  oldChatId: string,
  newChatId: string,
): Promise<void> {
  const entries = await storage.listWhitelist("chats");
  const old = entries.find((e) => e.id === oldChatId);
  if (!old) return;
  await storage.addWhitelist("chats", { ...old, id: newChatId });
  await storage.removeWhitelist("chats", oldChatId);
}

async function migrateDirectory(
  storage: Storage,
  oldChatId: string,
  newChatId: string,
): Promise<void> {
  const old = await storage.getChat(oldChatId);
  if (!old) return;
  // The middleware may already have upserted the supergroup row (fresher
  // title/type); keep its identity fields but carry over the old group's
  // first-seen instant so the chat is never mistaken for a brand-new group.
  const existing = await storage.getChat(newChatId);
  const merged: Chat = {
    ...(existing ?? { ...old, id: newChatId }),
    firstSeenAt: Math.min(old.firstSeenAt, existing?.firstSeenAt ?? Infinity),
    lastSeenAt: Math.max(old.lastSeenAt, existing?.lastSeenAt ?? 0),
  };
  await storage.upsertChat(merged);
  await storage.deleteChat(oldChatId);
}

async function migrateChecks(
  storage: Storage,
  oldChatId: string,
  newChatId: string,
): Promise<void> {
  const checks = await storage.listChecks();
  for (const check of checks) {
    if (check.chatId !== oldChatId) continue;
    await storage.saveCheck({ ...check, chatId: newChatId });
  }
}

// Reminders are per-character (`forBot`-scoped), so rewrite them in the main
// bot's namespace AND every managed bot's. A reminder delivered between the
// list and the save would be resurrected once — consistent with the delivery
// path's at-least-once semantics.
async function migrateReminders(
  storage: Storage,
  oldChatId: string,
  newChatId: string,
): Promise<void> {
  const bots = await storage.listManagedBots();
  for (const botId of [null, ...bots.map((b) => b.botId)]) {
    const view = storage.forBot(botId);
    const reminders = await view.listAllReminders();
    for (const r of reminders) {
      const target =
        r.target.kind === "ask_reply" && r.target.chatId === oldChatId
          ? { ...r.target, chatId: newChatId }
          : r.target;
      if (r.chatId !== oldChatId && target === r.target) continue;
      await view.saveReminder({
        ...r,
        chatId: r.chatId === oldChatId ? newChatId : r.chatId,
        target,
      });
    }
  }
}

async function migratePresence(
  storage: Storage,
  oldChatId: string,
  newChatId: string,
): Promise<void> {
  const presence = await storage.getBotPresence(oldChatId);
  for (const [botId, atMs] of Object.entries(presence)) {
    await storage.recordBotPresence(newChatId, botId, atMs);
    await storage.removeBotPresence(oldChatId, botId);
  }
}
