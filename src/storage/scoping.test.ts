// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect } from "bun:test";
import { MemoryStorage } from "./memory";
import { createUserFactsTools } from "../ai/tools/user-facts";
import { createReminderTools } from "../ai/tools/reminders";
import type { Tool, ToolCallContext } from "../ai/tools/registry";

// These tests guard the single correctness property the whole Managed Bots
// feature rests on: per-character data written by one bot is invisible to every
// other bot. Crucially they drive the *tool execute path* (not the raw storage
// facade), because that is the only place where scoping is applied manually
// (`storage.forBot(ctx.botId)`) and could silently regress.

function byName(tools: Tool[], name: string): Tool {
  const t = tools.find((t) => t.name === name);
  if (!t) throw new Error(`tool not found: ${name}`);
  return t;
}

function ctx(botId: string | null, over: Partial<ToolCallContext> = {}): ToolCallContext {
  return {
    source: "ask",
    chatId: "chat-1",
    userId: "user-1",
    botId,
    replyToMessageId: 42,
    timezone: "UTC",
    lang: "en",
    now: 1_700_000_000_000,
    ...over,
  };
}

test("user_facts written via a managed bot's tool scope are invisible to the main bot", async () => {
  const storage = new MemoryStorage();
  const tools = createUserFactsTools({ storage });
  const remember = byName(tools, "remember_fact");
  const list = byName(tools, "list_facts");

  // Cat (managed bot) remembers a fact through the tool.
  await remember.execute({ key: "mood", value: "playful" }, ctx("cat-bot"));

  // Cat sees it through BOTH paths: the tool path AND the handler path
  // (storage.forBot(botId).listUserFacts, used to surface facts in the prompt).
  const catViaTool = (await list.execute({}, ctx("cat-bot"))) as Array<{
    key: string;
    value: string;
  }>;
  expect(catViaTool).toEqual([{ key: "mood", value: "playful" }]);
  expect(await storage.forBot("cat-bot").listUserFacts("user-1")).toEqual([
    { key: "mood", value: "playful" },
  ]);

  // The main bot (null scope) sees nothing — neither via the tool nor directly.
  const mainViaTool = (await list.execute({}, ctx(null))) as unknown[];
  expect(mainViaTool).toEqual([]);
  expect(await storage.listUserFacts("user-1")).toEqual([]);
  expect(await storage.forBot(null).listUserFacts("user-1")).toEqual([]);
});

test("user_facts are isolated per managed bot", async () => {
  const storage = new MemoryStorage();
  const tools = createUserFactsTools({ storage });
  const remember = byName(tools, "remember_fact");

  await remember.execute({ key: "name", value: "guts" }, ctx("bot-a"));
  await remember.execute({ key: "name", value: "kitty" }, ctx("bot-b"));

  expect(await storage.forBot("bot-a").listUserFacts("user-1")).toEqual([
    { key: "name", value: "guts" },
  ]);
  expect(await storage.forBot("bot-b").listUserFacts("user-1")).toEqual([
    { key: "name", value: "kitty" },
  ]);
});

test("a fact written by the main bot is invisible to managed bots and vice versa", async () => {
  const storage = new MemoryStorage();
  const tools = createUserFactsTools({ storage });
  const remember = byName(tools, "remember_fact");

  // Main bot writes via the base storage path (no botId set).
  await remember.execute({ key: "topic", value: "swords" }, ctx(null));

  expect(await storage.listUserFacts("user-1")).toEqual([
    { key: "topic", value: "swords" },
  ]);
  expect(await storage.forBot("cat-bot").listUserFacts("user-1")).toEqual([]);
});

test("reminders created via a managed bot's tool scope only fire on that bot's scheduler", async () => {
  const storage = new MemoryStorage();
  const tools = createReminderTools({ storage });
  const scheduleIn = byName(tools, "schedule_reminder_in");

  const now = 1_700_000_000_000;
  const res = (await scheduleIn.execute(
    { amount: 10, unit: "minutes", text: "feed me" },
    ctx("cat-bot", { now }),
  )) as { ok: boolean };
  expect(res.ok).toBe(true);

  const afterFire = now + 11 * 60_000;

  // The cat's scheduler (its scoped storage) sees the due reminder.
  const catDue = await storage.forBot("cat-bot").fetchDueReminders(afterFire);
  expect(catDue).toHaveLength(1);
  expect(catDue[0]!.text).toBe("feed me");

  // The main bot's scheduler does not — neither the base nor the null scope.
  expect(await storage.fetchDueReminders(afterFire)).toHaveLength(0);
  expect(await storage.forBot(null).fetchDueReminders(afterFire)).toHaveLength(0);
  expect(await storage.forBot("other-bot").fetchDueReminders(afterFire)).toHaveLength(0);
});

test("forBot(null) is byte-identical scope to the base main storage", async () => {
  const storage = new MemoryStorage();
  await storage.saveConversation("chat-9", 100, {
    userQuestion: "hi",
    botAnswer: "hello",
    parentBotMsgId: null,
    ts: 1,
  });
  // Reading back through forBot(null) must return the same node the base wrote.
  const viaNull = await storage.forBot(null).getConversation("chat-9", 100);
  expect(viaNull?.botAnswer).toBe("hello");
  // A managed scope must not see it.
  expect(await storage.forBot("cat-bot").getConversation("chat-9", 100)).toBeNull();
});
