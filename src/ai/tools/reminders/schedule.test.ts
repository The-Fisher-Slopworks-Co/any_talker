// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { MemoryStorage } from "../../../storage/memory";
import { createScheduleReminderTool } from "./schedule";
import { MAX_REMINDER_OCCURRENCES } from "../../../reminders/types";
import { DEFAULT_SETTINGS } from "../../../shared/types";
import { wallClockToUtcMs } from "../../../shared/tz";
import type { ToolCallContext } from "../registry";

// Each mode keeps its own fixtures (clock, timezone), so each gets its own
// top-level describe to scope them.

describe("schedule_reminder", () => {
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

  describe("one-off after a delay", () => {
    test("accepts the 1-minute floor exactly", async () => {
      const storage = new MemoryStorage();
      const tool = createScheduleReminderTool({ storage });
      const out = await tool.execute(
        { inAmount: 1, inUnit: "minutes", text: "x" },
        { ...askCtx, now: 0 },
      );
      if (!("ok" in out) || !out.ok) throw new Error("expected ok");
      expect(out.fireAt).toBe("1970-01-01T00:01");
    });

    test("schema rejects amount=0", () => {
      const storage = new MemoryStorage();
      const tool = createScheduleReminderTool({ storage });
      expect(
        tool.parameters.safeParse({ inAmount: 0, inUnit: "minutes", text: "x" })
          .success,
      ).toBe(false);
    });

    test("ask: persists with ask_reply target", async () => {
      const storage = new MemoryStorage();
      const tool = createScheduleReminderTool({ storage });
      const out = await tool.execute(
        { inAmount: 5, inUnit: "minutes", text: "ping" },
        askCtx,
      );
      if (!("ok" in out) || !out.ok) throw new Error("expected ok");
      const due = await storage.reminders.fetchDue(askCtx.now + 5 * 60_000);
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
      const tool = createScheduleReminderTool({ storage });
      const out = await tool.execute(
        { inAmount: 5, inUnit: "minutes", text: "ping" },
        guestCtx,
      );
      expect(out).toEqual({ ok: false, reason: expect.stringContaining("DM") });
      expect(
        await storage.reminders.fetchDue(askCtx.now + 60 * 60_000),
      ).toEqual([]);
    });

    test("guest: persists with guest_dm target after privateChats.record", async () => {
      const storage = new MemoryStorage();
      await storage.privateChats.record("u42");
      const tool = createScheduleReminderTool({ storage });
      const out = await tool.execute(
        { inAmount: 1, inUnit: "hours", text: "ping" },
        guestCtx,
      );
      if (!("ok" in out) || !out.ok) throw new Error("expected ok");
      const due = await storage.reminders.fetchDue(askCtx.now + 60 * 60_000);
      expect(due).toHaveLength(1);
      expect(due[0]?.target).toEqual({ kind: "guest_dm", userId: "u42" });
    });

    test("returned fireAt matches saved record", async () => {
      const storage = new MemoryStorage();
      const tool = createScheduleReminderTool({ storage });
      const out = await tool.execute(
        { inAmount: 2, inUnit: "days", text: "ping" },
        askCtx,
      );
      if (!("ok" in out) || !out.ok) throw new Error();
      // now (00:16:40 UTC) + 2 days, as local wall-clock time.
      expect(out.fireAt).toBe("1970-01-03T00:16");
    });
  });
});

describe("schedule_reminder", () => {
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

  describe("one-off at a wall-clock time", () => {
    test("schedules in user's timezone (Moscow)", async () => {
      const storage = new MemoryStorage();
      const tool = createScheduleReminderTool({ storage });
      const out = await tool.execute(
        { atDatetime: "2026-05-20T18:00", text: "ping" },
        { ...askCtx, timezone: "Europe/Moscow" },
      );
      if (!("ok" in out) || !out.ok) throw new Error("expected ok");
      // Local wall-clock time, the same form the input took — not UTC.
      expect(out.fireAt).toBe("2026-05-20T18:00");
    });

    test("rejects datetime in the past", async () => {
      const storage = new MemoryStorage();
      const tool = createScheduleReminderTool({ storage });
      const out = await tool.execute(
        { atDatetime: "2020-01-01T00:00", text: "ping" },
        askCtx,
      );
      expect(out).toEqual({
        ok: false,
        reason: expect.stringContaining("1 minute"),
      });
    });

    test("rejects datetime less than 1 minute from now", async () => {
      const storage = new MemoryStorage();
      const tool = createScheduleReminderTool({ storage });
      // 12:00:30 UTC is 30 seconds after now
      const out = await tool.execute(
        { atDatetime: "2026-05-20T12:00", text: "ping" },
        askCtx,
      );
      expect(out).toEqual({
        ok: false,
        reason: expect.stringContaining("1 minute"),
      });
    });

    test("rejects unparseable datetime", async () => {
      const storage = new MemoryStorage();
      const tool = createScheduleReminderTool({ storage });
      const out = await tool.execute(
        { atDatetime: "tomorrow at 6pm", text: "ping" },
        askCtx,
      );
      expect(out).toEqual({ ok: false, reason: expect.any(String) });
    });

    test("rejects invalid timezone", async () => {
      const storage = new MemoryStorage();
      const tool = createScheduleReminderTool({ storage });
      const out = await tool.execute(
        { atDatetime: "2026-06-01T10:00", text: "ping" },
        { ...askCtx, timezone: "Not/Real" },
      );
      expect(out).toEqual({
        ok: false,
        reason: expect.stringContaining("timezone"),
      });
    });

    test("guest path requires private chat", async () => {
      const storage = new MemoryStorage();
      const tool = createScheduleReminderTool({ storage });
      const out = await tool.execute(
        { atDatetime: "2026-06-01T10:00", text: "ping" },
        {
          ...askCtx,
          source: "guest",
          replyToMessageId: null,
          timezone: "UTC",
        },
      );
      expect(out).toEqual({ ok: false, reason: expect.stringContaining("DM") });
    });

    test("guest path succeeds after privateChats.record", async () => {
      const storage = new MemoryStorage();
      await storage.privateChats.record("u42");
      const tool = createScheduleReminderTool({ storage });
      const out = await tool.execute(
        { atDatetime: "2026-06-01T10:00", text: "ping" },
        {
          ...askCtx,
          source: "guest",
          replyToMessageId: null,
          timezone: "UTC",
        },
      );
      if (!("ok" in out) || !out.ok) throw new Error("expected ok");
      expect(out.fireAt).toBe("2026-06-01T10:00");
      const due = await storage.reminders.fetchDue(Date.UTC(2026, 5, 1, 10, 0));
      expect(due[0]?.target).toEqual({ kind: "guest_dm", userId: "u42" });
    });
  });
});

describe("schedule_reminder", () => {
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
    createScheduleReminderTool({ storage });

  describe("repeating", () => {
    test("every 20 minutes starts one interval from now", async () => {
      const storage = new MemoryStorage();
      const out = await toolWith(storage).execute(
        { everyAmount: 20, everyUnit: "minutes", text: "ping" },
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
          everyAmount: 1,
          everyUnit: "days",
          atDatetime: "2026-09-09T18:30",
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
          everyAmount: 2,
          everyUnit: "weeks",
          atDatetime: "2026-09-18T09:00",
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
        { everyAmount: 2, everyUnit: "minutes", text: "ping" },
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
        { everyAmount: 5, everyUnit: "minutes", text: "ping" },
        askCtx,
      );
      expect(out.ok).toBe(true);
    });

    test("rejects a malformed startAt", async () => {
      const storage = new MemoryStorage();
      const out = await toolWith(storage).execute(
        {
          everyAmount: 1,
          everyUnit: "days",
          atDatetime: "18 сентября",
          text: "ping",
        },
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
        {
          everyAmount: 1,
          everyUnit: "days",
          atDatetime: "2026-09-09T08:00",
          text: "ping",
        },
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
        { everyAmount: 1, everyUnit: "hours", text: "series" },
        askCtx,
      );
      expect(first.ok).toBe(true);
      const second = await tool.execute(
        { everyAmount: 1, everyUnit: "hours", text: "another" },
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
});

describe("schedule_reminder schema", () => {
  const schema = createScheduleReminderTool({
    storage: new MemoryStorage(),
  }).parameters;
  const ok = (input: object) => schema.safeParse(input).success;

  test("accepts each mode on its own", () => {
    expect(ok({ text: "x", inAmount: 5, inUnit: "minutes" })).toBe(true);
    expect(ok({ text: "x", atDatetime: "2026-05-20T18:00" })).toBe(true);
    expect(ok({ text: "x", everyAmount: 1, everyUnit: "days" })).toBe(true);
    expect(
      ok({
        text: "x",
        everyAmount: 1,
        everyUnit: "weeks",
        atDatetime: "2026-09-18T09:00",
      }),
    ).toBe(true);
  });

  test("rejects a call without any time", () => {
    expect(ok({ text: "x" })).toBe(false);
  });

  test("rejects half of a pair", () => {
    expect(ok({ text: "x", inAmount: 5 })).toBe(false);
    expect(ok({ text: "x", everyUnit: "days" })).toBe(false);
  });

  test("rejects a delay together with a wall-clock time", () => {
    expect(
      ok({
        text: "x",
        inAmount: 5,
        inUnit: "minutes",
        atDatetime: "2026-05-20T18:00",
      }),
    ).toBe(false);
  });

  test("rejects a delay as the start of a series", () => {
    expect(
      ok({
        text: "x",
        inAmount: 5,
        inUnit: "minutes",
        everyAmount: 1,
        everyUnit: "hours",
      }),
    ).toBe(false);
  });

  test("weeks are a repeat unit only", () => {
    expect(ok({ text: "x", inAmount: 1, inUnit: "weeks" })).toBe(false);
  });
});
