// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { advanceRecurrence, computeNextFireAtMs } from "./recurrence";
import { wallClockToUtcMs } from "../shared/tz";
import type { Reminder } from "./types";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const at = (
  y: number,
  mo: number,
  d: number,
  h: number,
  mi: number,
  tz: string,
): number => {
  const res = wallClockToUtcMs(y, mo, d, h, mi, tz);
  if (!res.ok) throw new Error(`bad fixture time: ${res.reason}`);
  return res.ms;
};

const reminder = (over: Partial<Reminder> = {}): Reminder => ({
  id: "r1",
  userId: "u1",
  chatId: "c1",
  lang: "en",
  fireAtMs: 100_000,
  text: "ping",
  target: { kind: "ask_reply", chatId: "c1", replyToMessageId: 7 },
  createdAtMs: 0,
  contextMessages: [],
  ...over,
});

describe("computeNextFireAtMs: interval", () => {
  const spec = { kind: "interval", everyMs: 20 * MINUTE } as const;

  test("adds one period to the occurrence just fired", () => {
    expect(computeNextFireAtMs(spec, 1_000_000, 1_000_010)).toBe(
      1_000_000 + 20 * MINUTE,
    );
  });

  test("is derived from the fired occurrence, not from now", () => {
    // Same stored occurrence, two different ticks within the period: a retry
    // must land on the very same instant rather than drift forward.
    const a = computeNextFireAtMs(spec, 1_000_000, 1_000_010);
    const b = computeNextFireAtMs(spec, 1_000_000, 1_000_000 + 5 * MINUTE);
    expect(b).toBe(a);
  });

  test("skips whole missed periods instead of firing a backlog", () => {
    // Scheduler down for just over three periods: the next fire is the first
    // one still in the future, and the series keeps its phase.
    const next = computeNextFireAtMs(spec, 1_000_000, 1_000_000 + 65 * MINUTE);
    expect(next).toBe(1_000_000 + 80 * MINUTE);
  });

  test("rejects a non-positive interval", () => {
    expect(computeNextFireAtMs({ kind: "interval", everyMs: 0 }, 1, 2)).toBe(
      null,
    );
  });
});

describe("computeNextFireAtMs: calendar", () => {
  // Europe/Moscow has no DST; Europe/Berlin does. Both are used below to pin
  // the wall-clock guarantee.
  const daily = (tz: string) =>
    ({
      kind: "calendar",
      everyDays: 1,
      hour: 18,
      minute: 30,
      timezone: tz,
    }) as const;

  test("every day keeps the wall-clock time", () => {
    const prev = at(2026, 9, 9, 18, 30, "Europe/Moscow");
    const next = computeNextFireAtMs(daily("Europe/Moscow"), prev, prev + 1);
    expect(next).toBe(at(2026, 9, 10, 18, 30, "Europe/Moscow"));
    expect(next! - prev).toBe(DAY);
  });

  test("every day survives a DST shift with the time, not the spacing", () => {
    // Berlin falls back on 2026-10-25: the gap between two 18:30 fires is 25
    // hours, and the wall-clock time is what stays put.
    const prev = at(2026, 10, 24, 18, 30, "Europe/Berlin");
    const next = computeNextFireAtMs(daily("Europe/Berlin"), prev, prev + 1);
    expect(next).toBe(at(2026, 10, 25, 18, 30, "Europe/Berlin"));
    expect(next! - prev).toBe(25 * HOUR);
  });

  test("every two weeks lands on the same weekday and time", () => {
    const spec = {
      kind: "calendar",
      everyDays: 14,
      hour: 9,
      minute: 0,
      timezone: "Europe/Moscow",
    } as const;
    const prev = at(2026, 9, 18, 9, 0, "Europe/Moscow");
    expect(computeNextFireAtMs(spec, prev, prev + 1)).toBe(
      at(2026, 10, 2, 9, 0, "Europe/Moscow"),
    );
  });

  test("skips missed days after a long outage", () => {
    const prev = at(2026, 9, 9, 18, 30, "Europe/Moscow");
    const now = at(2026, 9, 12, 12, 0, "Europe/Moscow");
    expect(computeNextFireAtMs(daily("Europe/Moscow"), prev, now)).toBe(
      at(2026, 9, 12, 18, 30, "Europe/Moscow"),
    );
  });

  test("a timezone that no longer resolves ends the series", () => {
    const spec = { ...daily("Europe/Moscow"), timezone: "Mars/Olympus" };
    const prev = at(2026, 9, 9, 18, 30, "UTC");
    expect(computeNextFireAtMs(spec, prev, prev + 1)).toBe(null);
  });
});

describe("advanceRecurrence", () => {
  const spec = { kind: "interval", everyMs: 30 * MINUTE } as const;

  test("moves the reminder on and spends one occurrence", () => {
    const next = advanceRecurrence(
      reminder({
        fireAtMs: 1_000_000,
        recurrence: { spec, occurrencesLeft: 4, occurrencesTotal: 4 },
      }),
      1_000_010,
    );
    expect(next).toMatchObject({
      id: "r1",
      fireAtMs: 1_000_000 + 30 * MINUTE,
      recurrence: { occurrencesLeft: 3, occurrencesTotal: 4 },
    });
  });

  test("ends the series after the last allowed occurrence", () => {
    expect(
      advanceRecurrence(
        reminder({
          recurrence: { spec, occurrencesLeft: 1, occurrencesTotal: 4 },
        }),
        1_000_010,
      ),
    ).toBe(null);
  });

  test("a one-shot never advances", () => {
    expect(advanceRecurrence(reminder(), 1_000_010)).toBe(null);
  });
});
