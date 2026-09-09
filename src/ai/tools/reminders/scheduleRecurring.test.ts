// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { MemoryStorage } from "../../../storage/memory";
import { createScheduleRecurringReminderTool } from "./scheduleRecurring";
import { MAX_REMINDER_OCCURRENCES } from "../../../reminders/types";
import { DEFAULT_SETTINGS } from "../../../shared/types";
import { wallClockToUtcMs } from "../../../shared/tz";
import type { ToolCallContext } from "../registry";

const MINUTE = 60_000;

// 2026-09-09 12:00 in Moscow, the timezone the issue's Russian examples are
// written for.
const nowMs = (() => {
  const res = wallClockToUtcMs(2026, 9, 9, 12, 0, "Europe/Moscow");
  if (!res.ok) throw new Error("bad fixture time");
  return res.ms;
})();

const askCtx: ToolCallContext = {
  source: "ask",
  chatId: "c1",
  userId: "u42",
  replyToMessageId: 100,
  timezone: "Europe/Moscow",
  lang: "en",
  now: nowMs,
};

const at = (mo: number, d: number, h: number, mi: number) => {
  const res = wallClockToUtcMs(2026, mo, d, h, mi, "Europe/Moscow");
  if (!res.ok) throw new Error("bad fixture time");
  return res.ms;
};

const toolWith = (storage: MemoryStorage) =>
  createScheduleRecurringReminderTool({ storage });

describe("schedule_recurring_reminder", () => {
  test("every 20 minutes starts one interval from now", async () => {
    const storage = new MemoryStorage();
    const out = await toolWith(storage).execute(
      { amount: 20, unit: "minutes", text: "ping" },
      askCtx,
    );
    if (!out.ok) throw new Error(out.reason);
    const saved = await storage.reminders.get(out.reminderId);
    expect(saved).toMatchObject({
      fireAtMs: nowMs + 20 * MINUTE,
      recurrence: {
        spec: { kind: "interval", everyMs: 20 * MINUTE },
        occurrencesLeft: MAX_REMINDER_OCCURRENCES,
        occurrencesTotal: MAX_REMINDER_OCCURRENCES,
      },
    });
  });

  test("every day at 18:30 anchors to the wall clock", async () => {
    const storage = new MemoryStorage();
    const out = await toolWith(storage).execute(
      {
        amount: 1,
        unit: "days",
        startAt: "2026-09-09T18:30",
        text: "ping",
      },
      askCtx,
    );
    if (!out.ok) throw new Error(out.reason);
    expect(await storage.reminders.get(out.reminderId)).toMatchObject({
      fireAtMs: at(9, 9, 18, 30),
      recurrence: {
        spec: {
          kind: "calendar",
          everyDays: 1,
          hour: 18,
          minute: 30,
          timezone: "Europe/Moscow",
        },
      },
    });
  });

  test("every two weeks starting 18 September", async () => {
    const storage = new MemoryStorage();
    const out = await toolWith(storage).execute(
      {
        amount: 2,
        unit: "weeks",
        startAt: "2026-09-18T09:00",
        text: "ping",
      },
      askCtx,
    );
    if (!out.ok) throw new Error(out.reason);
    expect(await storage.reminders.get(out.reminderId)).toMatchObject({
      fireAtMs: at(9, 18, 9, 0),
      recurrence: { spec: { kind: "calendar", everyDays: 14, hour: 9 } },
    });
  });

  test("rejects an interval under the 5-minute floor", async () => {
    const storage = new MemoryStorage();
    const out = await toolWith(storage).execute(
      { amount: 2, unit: "minutes", text: "ping" },
      askCtx,
    );
    expect(out).toEqual({
      ok: false,
      reason: expect.stringContaining("5 minutes"),
    });
    expect(await storage.reminders.listForUser("u42")).toEqual([]);
  });

  test("accepts the 5-minute floor exactly", async () => {
    const storage = new MemoryStorage();
    const out = await toolWith(storage).execute(
      { amount: 5, unit: "minutes", text: "ping" },
      askCtx,
    );
    expect(out.ok).toBe(true);
  });

  test("rejects a malformed startAt", async () => {
    const storage = new MemoryStorage();
    const out = await toolWith(storage).execute(
      { amount: 1, unit: "days", startAt: "18 сентября", text: "ping" },
      askCtx,
    );
    expect(out).toEqual({
      ok: false,
      reason: expect.stringContaining("YYYY-MM-DDTHH:MM"),
    });
  });

  test("rejects a startAt that is already past", async () => {
    const storage = new MemoryStorage();
    const out = await toolWith(storage).execute(
      { amount: 1, unit: "days", startAt: "2026-09-09T08:00", text: "ping" },
      askCtx,
    );
    expect(out.ok).toBe(false);
  });

  test("the whole series takes one slot of the per-user cap", async () => {
    const storage = new MemoryStorage();
    await storage.settings.save({
      ...DEFAULT_SETTINGS,
      maxRemindersPerUser: 1,
    });
    const tool = toolWith(storage);
    const first = await tool.execute(
      { amount: 1, unit: "hours", text: "series" },
      askCtx,
    );
    expect(first.ok).toBe(true);
    const second = await tool.execute(
      { amount: 1, unit: "hours", text: "another" },
      askCtx,
    );
    expect(second).toEqual({
      ok: false,
      reason: expect.stringContaining("limit_reached"),
    });
  });

  test("is not offered during a reminder delivery", () => {
    const tool = toolWith(new MemoryStorage());
    expect(tool.sources).not.toContain("reminder_delivery");
  });
});
