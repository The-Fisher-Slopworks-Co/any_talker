// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { MemoryStorage } from "../../../storage/memory";
import { createScheduleReminderAtTool } from "./scheduleAt";
import type { ToolCallContext } from "../registry";

const may20noon = Date.UTC(2026, 4, 20, 12, 0); // 2026-05-20 12:00 UTC

const askCtx: ToolCallContext = {
  source: "ask",
  chatId: "c1",
  userId: "u42",
  replyToMessageId: 100,
  timezone: "UTC",
  lang: "en",
  now: may20noon,
};

describe("schedule_reminder_at", () => {
  test("schedules in user's timezone (Moscow)", async () => {
    const storage = new MemoryStorage();
    const tool = createScheduleReminderAtTool({ storage });
    const out = await tool.execute(
      { datetime: "2026-05-20T18:00", text: "ping" },
      { ...askCtx, timezone: "Europe/Moscow" },
    );
    if (!("ok" in out) || !out.ok) throw new Error("expected ok");
    expect(out.fireAt).toBe("2026-05-20T15:00:00.000Z");
  });

  test("rejects datetime in the past", async () => {
    const storage = new MemoryStorage();
    const tool = createScheduleReminderAtTool({ storage });
    const out = await tool.execute(
      { datetime: "2020-01-01T00:00", text: "ping" },
      askCtx,
    );
    expect(out).toEqual({ ok: false, reason: expect.stringContaining("1 minute") });
  });

  test("rejects datetime less than 1 minute from now", async () => {
    const storage = new MemoryStorage();
    const tool = createScheduleReminderAtTool({ storage });
    // 12:00:30 UTC is 30 seconds after now
    const out = await tool.execute(
      { datetime: "2026-05-20T12:00", text: "ping" },
      askCtx,
    );
    expect(out).toEqual({ ok: false, reason: expect.stringContaining("1 minute") });
  });

  test("rejects unparseable datetime", async () => {
    const storage = new MemoryStorage();
    const tool = createScheduleReminderAtTool({ storage });
    const out = await tool.execute(
      { datetime: "tomorrow at 6pm", text: "ping" },
      askCtx,
    );
    expect(out).toEqual({ ok: false, reason: expect.any(String) });
  });

  test("rejects invalid timezone", async () => {
    const storage = new MemoryStorage();
    const tool = createScheduleReminderAtTool({ storage });
    const out = await tool.execute(
      { datetime: "2026-06-01T10:00", text: "ping" },
      { ...askCtx, timezone: "Not/Real" },
    );
    expect(out).toEqual({ ok: false, reason: expect.stringContaining("timezone") });
  });

  test("guest path requires private chat", async () => {
    const storage = new MemoryStorage();
    const tool = createScheduleReminderAtTool({ storage });
    const out = await tool.execute(
      { datetime: "2026-06-01T10:00", text: "ping" },
      {
        ...askCtx,
        source: "guest",
        replyToMessageId: null,
        timezone: "UTC",
      },
    );
    expect(out).toEqual({ ok: false, reason: expect.stringContaining("/start") });
  });

  test("guest path succeeds after recordPrivateChat", async () => {
    const storage = new MemoryStorage();
    await storage.recordPrivateChat("u42");
    const tool = createScheduleReminderAtTool({ storage });
    const out = await tool.execute(
      { datetime: "2026-06-01T10:00", text: "ping" },
      {
        ...askCtx,
        source: "guest",
        replyToMessageId: null,
        timezone: "UTC",
      },
    );
    if (!("ok" in out) || !out.ok) throw new Error("expected ok");
    expect(out.fireAt).toBe("2026-06-01T10:00:00.000Z");
    const due = await storage.fetchDueReminders(Date.UTC(2026, 5, 1, 10, 0));
    expect(due[0]?.target).toEqual({ kind: "guest_dm", userId: "u42" });
  });
});
