// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { MemoryStorage } from "./memory";
import { migrateChatData } from "./migrate-chat";
import type { RecurringCheck } from "../checks/types";
import type { Reminder } from "../reminders/types";

const OLD = "-5103288356";
const NEW = "-1003965869359";
const NOW = Date.UTC(2026, 6, 13, 12, 0);

function makeCheck(over: Partial<RecurringCheck> = {}): RecurringCheck {
  return {
    id: "c1",
    title: "Sport",
    chatId: OLD,
    targetUserId: "user-1",
    targetName: "Nikita",
    scheduleHour: 23,
    scheduleMinute: 30,
    timezone: "UTC",
    question: "{name}, sport?",
    yesButton: "Yes",
    noButton: "No",
    yesReply: "{name}, ok",
    noReply: "{name}, no",
    timeoutMinutes: 25,
    counter: 1,
    counterMode: "always_increment",
    counterAnchorDate: null,
    enabled: true,
    lastFiredAtMs: 0,
    pendingMessageId: null,
    pendingFiredAtMs: null,
    createdAtMs: 0,
    ...over,
  };
}

function makeReminder(over: Partial<Reminder> = {}): Reminder {
  return {
    id: "r1",
    userId: "u1",
    chatId: OLD,
    lang: "ru",
    fireAtMs: NOW + 3_600_000,
    createdAtMs: NOW,
    text: "note",
    target: { kind: "ask_reply", chatId: OLD, replyToMessageId: 7 },
    contextMessages: [],
    ...over,
  };
}

describe("migrateChatData", () => {
  test("moves chat settings to the new id, deleting the old key", async () => {
    const storage = new MemoryStorage();
    await storage.chats.saveSettings(OLD, {
      botName: "Capybara",
      timezone: "UTC",
    });

    await migrateChatData(storage, OLD, NEW, NOW);

    expect(await storage.chats.getSettings(NEW)).toEqual({
      botName: "Capybara",
      timezone: "UTC",
    });
    expect(await storage.chats.getSettings(OLD)).toBeNull();
  });

  test("settings already written under the new id win over migrated ones", async () => {
    const storage = new MemoryStorage();
    await storage.chats.saveSettings(OLD, { botName: "Old", timezone: "UTC" });
    await storage.chats.saveSettings(NEW, { botName: "New" });

    await migrateChatData(storage, OLD, NEW, NOW);

    expect(await storage.chats.getSettings(NEW)).toEqual({
      botName: "New",
      timezone: "UTC",
    });
  });

  test("moves the chat whitelist entry, keeping its label", async () => {
    const storage = new MemoryStorage();
    await storage.access.addWhitelist("chats", { id: OLD, label: "Our group" });
    await storage.access.addWhitelist("chats", { id: "-42", label: "Other" });

    await migrateChatData(storage, OLD, NEW, NOW);

    expect(await storage.access.isWhitelisted("chats", NEW)).toBe(true);
    expect(await storage.access.isWhitelisted("chats", OLD)).toBe(false);
    const entries = await storage.access.listWhitelist("chats");
    expect(entries.find((e) => e.id === NEW)?.label).toBe("Our group");
    expect(entries.find((e) => e.id === "-42")).toBeDefined();
  });

  test("moves the chat blacklist entry, so an upgrade can't unblock a group", async () => {
    const storage = new MemoryStorage();
    await storage.access.addBlacklist("chats", { id: OLD, label: "Trolls" });

    await migrateChatData(storage, OLD, NEW, NOW);

    expect(await storage.access.isBlacklisted("chats", NEW)).toBe(true);
    expect(await storage.access.isBlacklisted("chats", OLD)).toBe(false);
    const entries = await storage.access.listBlacklist("chats");
    expect(entries.find((e) => e.id === NEW)?.label).toBe("Trolls");
  });

  test("merges the directory row: supergroup identity, earliest firstSeenAt", async () => {
    const storage = new MemoryStorage();
    await storage.chats.upsert({
      id: OLD,
      type: "group",
      title: "Chat",
      username: null,
      firstSeenAt: 1000,
      lastSeenAt: 2000,
    });
    // The middleware already upserted the supergroup row with a fresh
    // firstSeenAt (the migration service message itself).
    await storage.chats.upsert({
      id: NEW,
      type: "supergroup",
      title: "Chat",
      username: null,
      firstSeenAt: NOW,
      lastSeenAt: NOW,
    });

    await migrateChatData(storage, OLD, NEW, NOW);

    expect(await storage.chats.get(OLD)).toBeNull();
    const merged = await storage.chats.get(NEW);
    expect(merged?.type).toBe("supergroup");
    expect(merged?.firstSeenAt).toBe(1000);
    expect(merged?.lastSeenAt).toBe(NOW);
  });

  test("creates the directory row under the new id when none exists yet", async () => {
    const storage = new MemoryStorage();
    await storage.chats.upsert({
      id: OLD,
      type: "group",
      title: "Chat",
      username: null,
      firstSeenAt: 1000,
      lastSeenAt: 2000,
    });

    await migrateChatData(storage, OLD, NEW, NOW);

    expect(await storage.chats.get(OLD)).toBeNull();
    const moved = await storage.chats.get(NEW);
    expect(moved?.title).toBe("Chat");
    expect(moved?.firstSeenAt).toBe(1000);
  });

  test("repoints checks in the migrated chat only", async () => {
    const storage = new MemoryStorage();
    await storage.checks.save(makeCheck({ id: "c1" }));
    await storage.checks.save(makeCheck({ id: "c2", chatId: "-42" }));

    await migrateChatData(storage, OLD, NEW, NOW);

    expect((await storage.checks.get("c1"))?.chatId).toBe(NEW);
    expect((await storage.checks.get("c2"))?.chatId).toBe("-42");
  });

  test("repoints reminders in the main and every managed bot's namespace", async () => {
    const storage = new MemoryStorage();
    await storage.managedBots.save({
      botId: "777",
      ownerUserId: "owner",
      username: "cat_bot",
      displayName: "Кошечка",
      systemPrompt: "meow",
      createdAtMs: 0,
    });
    await storage.reminders.save(makeReminder({ id: "r-main" }));
    await storage
      .forBot("777")
      .reminders.save(makeReminder({ id: "r-managed" }));
    await storage.reminders.save(
      makeReminder({
        id: "r-other",
        chatId: "-42",
        target: { kind: "ask_reply", chatId: "-42", replyToMessageId: 1 },
      }),
    );

    await migrateChatData(storage, OLD, NEW, NOW);

    const main = await storage.reminders.get("r-main");
    expect(main?.chatId).toBe(NEW);
    expect(main?.target).toEqual({
      kind: "ask_reply",
      chatId: NEW,
      replyToMessageId: 7,
    });
    const managed = await storage.forBot("777").reminders.get("r-managed");
    expect(managed?.chatId).toBe(NEW);
    expect(managed?.target).toEqual({
      kind: "ask_reply",
      chatId: NEW,
      replyToMessageId: 7,
    });
    const other = await storage.reminders.get("r-other");
    expect(other?.chatId).toBe("-42");
  });

  test("repoints a guest-dm reminder's origin chat but not its target", async () => {
    const storage = new MemoryStorage();
    await storage.reminders.save(
      makeReminder({
        id: "r-guest",
        target: { kind: "guest_dm", userId: "u1" },
      }),
    );

    await migrateChatData(storage, OLD, NEW, NOW);

    const r = await storage.reminders.get("r-guest");
    expect(r?.chatId).toBe(NEW);
    expect(r?.target).toEqual({ kind: "guest_dm", userId: "u1" });
  });

  test("moves bot presence to the new chat id", async () => {
    const storage = new MemoryStorage();
    await storage.presence.record(OLD, "111", 5000);
    await storage.presence.record(OLD, "222", 6000);

    await migrateChatData(storage, OLD, NEW, NOW);

    expect(await storage.presence.get(NEW)).toEqual({
      "111": 5000,
      "222": 6000,
    });
    expect(await storage.presence.get(OLD)).toEqual({});
  });

  test("moves spend history and never doubles it on a re-run", async () => {
    const storage = new MemoryStorage();
    await storage.spend.addChat(OLD, 0.5, NOW - 86_400_000);
    await storage.spend.addChat(OLD, 0.25, NOW);
    await storage.spend.addChat(NEW, 0.1, NOW);

    await migrateChatData(storage, OLD, NEW, NOW);
    // Both service-message variants (and every family bot) trigger the same
    // migration — a second run must be a no-op.
    await migrateChatData(storage, OLD, NEW, NOW);

    const moved = await storage.spend.getChat(NEW, NOW);
    expect(moved.day).toBeCloseTo(0.35);
    expect(moved.week).toBeCloseTo(0.85);
    expect((await storage.spend.getChat(OLD, NOW)).week).toBeCloseTo(0);
  });

  test("leaves conversation nodes under the old id (different message-id spaces)", async () => {
    const storage = new MemoryStorage();
    await storage.conversations.save(OLD, 5, {
      userQuestion: "q",
      botAnswer: "a",
      parentBotMsgId: null,
      ts: NOW,
    });

    await migrateChatData(storage, OLD, NEW, NOW);

    expect(await storage.conversations.get(NEW, 5)).toBeNull();
    expect(await storage.conversations.get(OLD, 5)).not.toBeNull();
  });

  test("a failing step does not abort the remaining steps", async () => {
    const storage = new MemoryStorage();
    await storage.chats.saveSettings(OLD, { botName: "Capybara" });
    await storage.checks.save(makeCheck());
    storage.access.listWhitelist = async () => {
      throw new Error("keydb down");
    };
    const originalError = console.error;
    console.error = () => {};
    try {
      await migrateChatData(storage, OLD, NEW, NOW);
    } finally {
      console.error = originalError;
    }

    expect((await storage.chats.getSettings(NEW))?.botName).toBe("Capybara");
    expect((await storage.checks.get("c1"))?.chatId).toBe(NEW);
  });

  test("no-op when old and new ids are equal", async () => {
    const storage = new MemoryStorage();
    await storage.chats.saveSettings(OLD, { botName: "Capybara" });
    await migrateChatData(storage, OLD, OLD, NOW);
    expect((await storage.chats.getSettings(OLD))?.botName).toBe("Capybara");
  });
});
