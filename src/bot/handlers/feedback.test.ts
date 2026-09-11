// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { MemoryStorage } from "../../storage/memory";
import { createMainPersonaResolver } from "../../managed-bots/persona";
import { DEFAULT_SETTINGS } from "../../shared/types";
import { instructionHash } from "../../ai/instruction";
import {
  FEEDBACK_DAILY_MAX,
  FEEDBACK_TEXT_MAX,
  feedbackHandler,
  matchFeedbackCommand,
} from "./feedback";

const NOW = 1_700_000_000_000;
const USER = "u1";
const CHAT = "-100";

const run = (
  storage: MemoryStorage,
  over: Partial<Parameters<typeof feedbackHandler>[0]> = {},
) =>
  feedbackHandler({
    storage,
    resolver: createMainPersonaResolver(storage),
    ownerId: "owner",
    botId: null,
    userId: USER,
    chatId: CHAT,
    chatType: "supergroup",
    lang: "en",
    text: "the bot answered nonsense",
    now: NOW,
    build: "abc123",
    ...over,
  });

// The whitelist is on by default, and every test below but the access ones is
// about what happens once the reporter is past the gate.
async function openStorage(): Promise<MemoryStorage> {
  const storage = new MemoryStorage();
  await storage.settings.save({ ...DEFAULT_SETTINGS, whitelistEnabled: false });
  return storage;
}

// The single stored record, for the common case of exactly one.
async function onlyEntry(storage: MemoryStorage) {
  const page = await storage.feedback.list();
  expect(page.entries).toHaveLength(1);
  return page.entries[0]!;
}

describe("matchFeedbackCommand", () => {
  test("matches the bare command and this bot's mention", () => {
    expect(matchFeedbackCommand("/feedback", "mybot")).toEqual({ text: "" });
    expect(matchFeedbackCommand("  /FEEDBACK  ", "mybot")).toEqual({
      text: "",
    });
    expect(matchFeedbackCommand("/feedback@mybot broke", "mybot")).toEqual({
      text: "broke",
    });
  });

  test("ignores another bot's mention and unrelated text", () => {
    expect(matchFeedbackCommand("/feedback@other broke", "mybot")).toBeNull();
    expect(matchFeedbackCommand("/feedbackery broke", "mybot")).toBeNull();
    expect(matchFeedbackCommand("tell me about /feedback", "mybot")).toBeNull();
  });

  test("keeps a multi-line report whole and caps it at Telegram's limit", () => {
    expect(
      matchFeedbackCommand("/feedback line one\nline two", "mybot"),
    ).toEqual({ text: "line one\nline two" });
    const long = matchFeedbackCommand(`/feedback ${"x".repeat(5000)}`, "mybot");
    expect(long?.text).toHaveLength(FEEDBACK_TEXT_MAX);
  });
});

describe("feedbackHandler", () => {
  test("records the report with the reporter's recent threads", async () => {
    const storage = await openStorage();
    await storage.conversations.save(CHAT, 7, {
      userQuestion: "q",
      botAnswer: "a",
      parentBotMsgId: null,
      ts: NOW - 1000,
      run: { gen: ["gen-1"], model: "m", detail: "short", instr: "deadbeef" },
    });
    await storage.conversations.indexUserThread(USER, {
      kind: "chain",
      chatId: CHAT,
      botId: null,
      botMsgId: 7,
      parentBotMsgId: null,
      ts: NOW - 1000,
    });

    const outcome = await run(storage);
    expect(outcome.kind).toBe("recorded");

    const entry = await onlyEntry(storage);
    expect(entry.text).toBe("the bot answered nonsense");
    expect(entry.userId).toBe(USER);
    expect(entry.chatType).toBe("supergroup");
    expect(entry.status).toBe("new");
    expect(entry.build).toBe("abc123");
    expect(entry.isGuest).toBe(false);
    expect(entry.pointedAt).toBeUndefined();
    expect(entry.threads).toHaveLength(1);
    expect(entry.threads[0]!.turns[0]!.run?.gen).toEqual(["gen-1"]);
    // The stored prompt is the rendered instruction, and the hash is its own —
    // that is what a turn's `run.instr` is compared against.
    expect(entry.systemPrompt).toContain(DEFAULT_SETTINGS.systemPrompt);
    expect(entry.systemPromptHash).toBe(instructionHash(entry.systemPrompt));
  });

  test("stores pointedAt when the command replied to a bot message", async () => {
    const storage = await openStorage();
    await run(storage, { pointedAt: { chatId: CHAT, botMsgId: 42 } });
    expect((await onlyEntry(storage)).pointedAt).toEqual({
      chatId: CHAT,
      botMsgId: 42,
    });
  });

  test("survives a reporter with no indexed threads", async () => {
    const storage = await openStorage();
    expect((await run(storage)).kind).toBe("recorded");
    expect((await onlyEntry(storage)).threads).toEqual([]);
  });

  test("a bare /feedback stores nothing and spends no allowance", async () => {
    const storage = await openStorage();
    expect((await run(storage, { text: "" })).kind).toBe("empty");
    expect((await storage.feedback.list()).entries).toEqual([]);
    expect(await storage.feedback.bumpDailyCount(USER, NOW)).toBe(1);
  });

  test("caps submissions per user per day", async () => {
    const storage = await openStorage();
    for (let i = 0; i < FEEDBACK_DAILY_MAX; i++) {
      expect((await run(storage)).kind).toBe("recorded");
    }
    const over = await run(storage);
    expect(over).toEqual({ kind: "rateLimited" });
    expect((await storage.feedback.list()).entries).toHaveLength(
      FEEDBACK_DAILY_MAX,
    );
  });

  test("the cap is per user and resets on the next UTC day", async () => {
    const storage = await openStorage();
    for (let i = 0; i < FEEDBACK_DAILY_MAX; i++) await run(storage);
    expect((await run(storage, { userId: "u2" })).kind).toBe("recorded");
    const tomorrow = NOW + 24 * 60 * 60 * 1000;
    expect((await run(storage, { now: tomorrow })).kind).toBe("recorded");
  });

  test("denies a blacklisted reporter silently, storing nothing", async () => {
    const storage = await openStorage();
    await storage.access.addBlacklist("users", { id: USER });
    expect(await run(storage)).toEqual({
      kind: "denied",
      reason: "blacklisted",
    });
    expect((await storage.feedback.list()).entries).toEqual([]);
    // A denial must not have consumed the day's allowance either.
    expect(await storage.feedback.bumpDailyCount(USER, NOW)).toBe(1);
  });

  test("denies a stranger while the whitelist is on", async () => {
    // Default settings — the whitelist is on and this user is not on it.
    const storage = new MemoryStorage();
    expect(await run(storage)).toEqual({
      kind: "denied",
      reason: "not_whitelisted",
    });
    expect((await storage.feedback.list()).entries).toEqual([]);
  });
});
