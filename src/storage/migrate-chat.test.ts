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
    await storage.saveChatSettings(OLD, { botName: "Capybara", timezone: "UTC" });

    await migrateChatData(storage, OLD, NEW, NOW);

    expect(await storage.getChatSettings(NEW)).toEqual({
      botName: "Capybara",
      timezone: "UTC",
    });
    expect(await storage.getChatSettings(OLD)).toBeNull();
  });

  test("settings already written under the new id win over migrated ones", async () => {
    const storage = new MemoryStorage();
    await storage.saveChatSettings(OLD, { botName: "Old", timezone: "UTC" });
    await storage.saveChatSettings(NEW, { botName: "New" });

    await migrateChatData(storage, OLD, NEW, NOW);

    expect(await storage.getChatSettings(NEW)).toEqual({
      botName: "New",
      timezone: "UTC",
    });
  });

  test("moves the chat whitelist entry, keeping its label", async () => {
    const storage = new MemoryStorage();
    await storage.addWhitelist("chats", { id: OLD, label: "Our group" });
    await storage.addWhitelist("chats", { id: "-42", label: "Other" });

    await migrateChatData(storage, OLD, NEW, NOW);

    expect(await storage.isWhitelisted("chats", NEW)).toBe(true);
    expect(await storage.isWhitelisted("chats", OLD)).toBe(false);
    const entries = await storage.listWhitelist("chats");
    expect(entries.find((e) => e.id === NEW)?.label).toBe("Our group");
    expect(entries.find((e) => e.id === "-42")).toBeDefined();
  });

  test("merges the directory row: supergroup identity, earliest firstSeenAt", async () => {
    const storage = new MemoryStorage();
    await storage.upsertChat({
      id: OLD,
      type: "group",
      title: "Chat",
      username: null,
      firstSeenAt: 1000,
      lastSeenAt: 2000,
    });
    // The middleware already upserted the supergroup row with a fresh
    // firstSeenAt (the migration service message itself).
    await storage.upsertChat({
      id: NEW,
      type: "supergroup",
      title: "Chat",
      username: null,
      firstSeenAt: NOW,
      lastSeenAt: NOW,
    });

    await migrateChatData(storage, OLD, NEW, NOW);

    expect(await storage.getChat(OLD)).toBeNull();
    const merged = await storage.getChat(NEW);
    expect(merged?.type).toBe("supergroup");
    expect(merged?.firstSeenAt).toBe(1000);
    expect(merged?.lastSeenAt).toBe(NOW);
  });

  test("creates the directory row under the new id when none exists yet", async () => {
    const storage = new MemoryStorage();
    await storage.upsertChat({
      id: OLD,
      type: "group",
      title: "Chat",
      username: null,
      firstSeenAt: 1000,
      lastSeenAt: 2000,
    });

    await migrateChatData(storage, OLD, NEW, NOW);

    expect(await storage.getChat(OLD)).toBeNull();
    const moved = await storage.getChat(NEW);
    expect(moved?.title).toBe("Chat");
    expect(moved?.firstSeenAt).toBe(1000);
  });

  test("repoints checks in the migrated chat only", async () => {
    const storage = new MemoryStorage();
    await storage.saveCheck(makeCheck({ id: "c1" }));
    await storage.saveCheck(makeCheck({ id: "c2", chatId: "-42" }));

    await migrateChatData(storage, OLD, NEW, NOW);

    expect((await storage.getCheck("c1"))?.chatId).toBe(NEW);
    expect((await storage.getCheck("c2"))?.chatId).toBe("-42");
  });

  test("repoints reminders in the main and every managed bot's namespace", async () => {
    const storage = new MemoryStorage();
    await storage.saveManagedBot({
      botId: "777",
      ownerUserId: "owner",
      username: "cat_bot",
      displayName: "Кошечка",
      systemPrompt: "meow",
      createdAtMs: 0,
    });
    await storage.saveReminder(makeReminder({ id: "r-main" }));
    await storage
      .forBot("777")
      .saveReminder(makeReminder({ id: "r-managed" }));
    await storage.saveReminder(
      makeReminder({
        id: "r-other",
        chatId: "-42",
        target: { kind: "ask_reply", chatId: "-42", replyToMessageId: 1 },
      }),
    );

    await migrateChatData(storage, OLD, NEW, NOW);

    const main = await storage.getReminder("r-main");
    expect(main?.chatId).toBe(NEW);
    expect(main?.target).toEqual({
      kind: "ask_reply",
      chatId: NEW,
      replyToMessageId: 7,
    });
    const managed = await storage.forBot("777").getReminder("r-managed");
    expect(managed?.chatId).toBe(NEW);
    expect(managed?.target).toEqual({
      kind: "ask_reply",
      chatId: NEW,
      replyToMessageId: 7,
    });
    const other = await storage.getReminder("r-other");
    expect(other?.chatId).toBe("-42");
  });

  test("repoints a guest-dm reminder's origin chat but not its target", async () => {
    const storage = new MemoryStorage();
    await storage.saveReminder(
      makeReminder({ id: "r-guest", target: { kind: "guest_dm", userId: "u1" } }),
    );

    await migrateChatData(storage, OLD, NEW, NOW);

    const r = await storage.getReminder("r-guest");
    expect(r?.chatId).toBe(NEW);
    expect(r?.target).toEqual({ kind: "guest_dm", userId: "u1" });
  });

  test("moves bot presence to the new chat id", async () => {
    const storage = new MemoryStorage();
    await storage.recordBotPresence(OLD, "111", 5000);
    await storage.recordBotPresence(OLD, "222", 6000);

    await migrateChatData(storage, OLD, NEW, NOW);

    expect(await storage.getBotPresence(NEW)).toEqual({ "111": 5000, "222": 6000 });
    expect(await storage.getBotPresence(OLD)).toEqual({});
  });

  test("moves spend history and never doubles it on a re-run", async () => {
    const storage = new MemoryStorage();
    await storage.addChatSpend(OLD, 0.5, NOW - 86_400_000);
    await storage.addChatSpend(OLD, 0.25, NOW);
    await storage.addChatSpend(NEW, 0.1, NOW);

    await migrateChatData(storage, OLD, NEW, NOW);
    // Both service-message variants (and every family bot) trigger the same
    // migration — a second run must be a no-op.
    await migrateChatData(storage, OLD, NEW, NOW);

    const moved = await storage.getChatSpend(NEW, NOW);
    expect(moved.day).toBeCloseTo(0.35);
    expect(moved.week).toBeCloseTo(0.85);
    expect((await storage.getChatSpend(OLD, NOW)).week).toBeCloseTo(0);
  });

  test("leaves conversation nodes under the old id (different message-id spaces)", async () => {
    const storage = new MemoryStorage();
    await storage.saveConversation(OLD, 5, {
      userQuestion: "q",
      botAnswer: "a",
      parentBotMsgId: null,
      ts: NOW,
    });

    await migrateChatData(storage, OLD, NEW, NOW);

    expect(await storage.getConversation(NEW, 5)).toBeNull();
    expect(await storage.getConversation(OLD, 5)).not.toBeNull();
  });

  test("a failing step does not abort the remaining steps", async () => {
    const storage = new MemoryStorage();
    await storage.saveChatSettings(OLD, { botName: "Capybara" });
    await storage.saveCheck(makeCheck());
    storage.listWhitelist = async () => {
      throw new Error("keydb down");
    };
    const originalError = console.error;
    console.error = () => {};
    try {
      await migrateChatData(storage, OLD, NEW, NOW);
    } finally {
      console.error = originalError;
    }

    expect((await storage.getChatSettings(NEW))?.botName).toBe("Capybara");
    expect((await storage.getCheck("c1"))?.chatId).toBe(NEW);
  });

  test("no-op when old and new ids are equal", async () => {
    const storage = new MemoryStorage();
    await storage.saveChatSettings(OLD, { botName: "Capybara" });
    await migrateChatData(storage, OLD, OLD, NOW);
    expect((await storage.getChatSettings(OLD))?.botName).toBe("Capybara");
  });
});
