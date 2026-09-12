// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { Storage } from "./types";
import type { Chat } from "../shared/types";

// Moves every chat-scoped record from a retired group id to its supergroup
// successor, so an upgraded chat keeps its settings, whitelist access, checks,
// reminders, spend history, directory row and bot presence. Triggered by the
// Telegram `migrate_to_chat_id` / `migrate_from_chat_id` service messages (see
// `bot/listeners/chat-events.ts`), with the send-time migrate-and-retry in checks/reminders as
// the backstop when both service messages were missed.
//
// Every family bot in the chat receives its own copy of the service message,
// so this runs concurrently with itself: each step is idempotent (re-running
// converges on the same end state), and the one non-idempotent piece — summing
// spend buckets — is atomic inside `spend.moveChat`. A failing step is logged
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
//     chat id change;
//   - chat-scoped command menus — dropped instead of moved (`dropCommandMenus`).
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
    ["blacklist", () => migrateBlacklist(storage, oldChatId, newChatId)],
    ["directory", () => migrateDirectory(storage, oldChatId, newChatId)],
    ["checks", () => migrateChecks(storage, oldChatId, newChatId)],
    ["reminders", () => migrateReminders(storage, oldChatId, newChatId)],
    ["presence", () => migratePresence(storage, oldChatId, newChatId)],
    ["command_menus", () => dropCommandMenus(storage, oldChatId)],
    ["spend", () => storage.spend.moveChat(oldChatId, newChatId, nowMs)],
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

// Chat-scoped command menus are NOT carried over: the retired chat id cannot be
// addressed any more, so its Telegram-side overrides die with it and the rows
// would only linger in the rollback registry. The supergroup resolves its own
// menus on the first update after the upgrade (`bot/chat-commands.ts`).
async function dropCommandMenus(
  storage: Storage,
  oldChatId: string,
): Promise<void> {
  for (const menu of await storage.commandMenus.list()) {
    if (menu.chatId !== oldChatId) continue;
    await storage.commandMenus.forget(oldChatId, menu.botId);
  }
}

async function migrateSettings(
  storage: Storage,
  oldChatId: string,
  newChatId: string,
): Promise<void> {
  const old = await storage.chats.getSettings(oldChatId);
  if (!old) return;
  // Anything already written under the new id (a concurrent admin edit) wins
  // over the migrated values; saving `{}` deletes the old key.
  const existing = await storage.chats.getSettings(newChatId);
  await storage.chats.saveSettings(newChatId, { ...old, ...existing });
  await storage.chats.saveSettings(oldChatId, {});
}

async function migrateWhitelist(
  storage: Storage,
  oldChatId: string,
  newChatId: string,
): Promise<void> {
  const entries = await storage.access.listWhitelist("chats");
  const old = entries.find((e) => e.id === oldChatId);
  if (!old) return;
  await storage.access.addWhitelist("chats", { ...old, id: newChatId });
  await storage.access.removeWhitelist("chats", oldChatId);
}

// Carried over for the same reason as the whitelist, but the failure mode is
// worse: a blocked group that silently unblocks itself by upgrading.
async function migrateBlacklist(
  storage: Storage,
  oldChatId: string,
  newChatId: string,
): Promise<void> {
  const entries = await storage.access.listBlacklist("chats");
  const old = entries.find((e) => e.id === oldChatId);
  if (!old) return;
  await storage.access.addBlacklist("chats", { ...old, id: newChatId });
  await storage.access.removeBlacklist("chats", oldChatId);
}

async function migrateDirectory(
  storage: Storage,
  oldChatId: string,
  newChatId: string,
): Promise<void> {
  const old = await storage.chats.get(oldChatId);
  if (!old) return;
  // The middleware may already have upserted the supergroup row (fresher
  // title/type); keep its identity fields but carry over the old group's
  // first-seen instant so the chat is never mistaken for a brand-new group.
  const existing = await storage.chats.get(newChatId);
  const merged: Chat = {
    ...(existing ?? { ...old, id: newChatId }),
    firstSeenAt: Math.min(old.firstSeenAt, existing?.firstSeenAt ?? Infinity),
    lastSeenAt: Math.max(old.lastSeenAt, existing?.lastSeenAt ?? 0),
  };
  await storage.chats.upsert(merged);
  await storage.chats.delete(oldChatId);
}

async function migrateChecks(
  storage: Storage,
  oldChatId: string,
  newChatId: string,
): Promise<void> {
  const checks = await storage.checks.list();
  for (const check of checks) {
    if (check.chatId !== oldChatId) continue;
    await storage.checks.save({ ...check, chatId: newChatId });
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
  const bots = await storage.managedBots.list();
  for (const botId of [null, ...bots.map((b) => b.botId)]) {
    const view = storage.forBot(botId);
    const reminders = await view.reminders.listAll();
    for (const r of reminders) {
      const target =
        r.target.kind === "ask_reply" && r.target.chatId === oldChatId
          ? { ...r.target, chatId: newChatId }
          : r.target;
      if (r.chatId !== oldChatId && target === r.target) continue;
      await view.reminders.save({
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
  const presence = await storage.presence.get(oldChatId);
  for (const [botId, atMs] of Object.entries(presence)) {
    await storage.presence.record(newChatId, botId, atMs);
    await storage.presence.remove(oldChatId, botId);
  }
}
