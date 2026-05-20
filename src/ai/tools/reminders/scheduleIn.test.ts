// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { MemoryStorage } from "../../../storage/memory";
import { createScheduleReminderInTool } from "./scheduleIn";
import type { ToolCallContext } from "../registry";

const askCtx: ToolCallContext = {
  source: "ask",
  chatId: "c1",
  userId: "u42",
  replyToMessageId: 100,
  timezone: "UTC",
  lang: "en",
  now: 1_000_000,
};

const guestCtx: ToolCallContext = {
  source: "guest",
  chatId: "c1",
  userId: "u42",
  replyToMessageId: null,
  timezone: "UTC",
  lang: "en",
  now: 1_000_000,
};

describe("schedule_reminder_in", () => {
  test("accepts the 1-minute floor exactly", async () => {
    const storage = new MemoryStorage();
    const tool = createScheduleReminderInTool({ storage });
    const out = await tool.execute(
      { amount: 1, unit: "minutes", text: "x" },
      { ...askCtx, now: 0 },
    );
    if (!("ok" in out) || !out.ok) throw new Error("expected ok");
    expect(new Date(out.fireAt).getTime()).toBe(60_000);
  });

  test("schema rejects amount=0", () => {
    const storage = new MemoryStorage();
    const tool = createScheduleReminderInTool({ storage });
    expect(
      tool.parameters.safeParse({ amount: 0, unit: "minutes", text: "x" }).success,
    ).toBe(false);
  });

  test("ask: persists with ask_reply target", async () => {
    const storage = new MemoryStorage();
    const tool = createScheduleReminderInTool({ storage });
    const out = await tool.execute(
      { amount: 5, unit: "minutes", text: "ping" },
      askCtx,
    );
    if (!("ok" in out) || !out.ok) throw new Error("expected ok");
    const due = await storage.fetchDueReminders(askCtx.now + 5 * 60_000);
    expect(due).toHaveLength(1);
    expect(due[0]).toMatchObject({
      userId: "u42",
      text: "ping",
      fireAtMs: askCtx.now + 5 * 60_000,
      target: { kind: "ask_reply", chatId: "c1", replyToMessageId: 100 },
    });
  });

  test("guest: rejects when user has no private chat", async () => {
    const storage = new MemoryStorage();
    const tool = createScheduleReminderInTool({ storage });
    const out = await tool.execute(
      { amount: 5, unit: "minutes", text: "ping" },
      guestCtx,
    );
    expect(out).toEqual({ ok: false, reason: expect.stringContaining("DM") });
    expect(await storage.fetchDueReminders(askCtx.now + 60 * 60_000)).toEqual([]);
  });

  test("guest: persists with guest_dm target after recordPrivateChat", async () => {
    const storage = new MemoryStorage();
    await storage.recordPrivateChat("u42");
    const tool = createScheduleReminderInTool({ storage });
    const out = await tool.execute(
      { amount: 1, unit: "hours", text: "ping" },
      guestCtx,
    );
    if (!("ok" in out) || !out.ok) throw new Error("expected ok");
    const due = await storage.fetchDueReminders(askCtx.now + 60 * 60_000);
    expect(due).toHaveLength(1);
    expect(due[0]?.target).toEqual({ kind: "guest_dm", userId: "u42" });
  });

  test("returned fireAt matches saved record", async () => {
    const storage = new MemoryStorage();
    const tool = createScheduleReminderInTool({ storage });
    const out = await tool.execute(
      { amount: 2, unit: "days", text: "ping" },
      askCtx,
    );
    if (!("ok" in out) || !out.ok) throw new Error();
    expect(new Date(out.fireAt).getTime()).toBe(
      askCtx.now + 2 * 24 * 60 * 60_000,
    );
  });
});
