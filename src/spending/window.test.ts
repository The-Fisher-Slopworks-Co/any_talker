// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import {
  utcDateKey,
  recentUtcDateKeys,
  summarizeSpend,
  SPEND_WINDOW_DAYS,
} from "./window";

const DAY = 86_400_000;
// 2026-05-26T12:00:00Z — noon keeps the UTC date stable regardless of offset.
const NOW = Date.UTC(2026, 4, 26, 12, 0, 0);

describe("utcDateKey", () => {
  test("formats the UTC calendar date", () => {
    expect(utcDateKey(NOW)).toBe("2026-05-26");
  });

  test("uses UTC, not local time, near the day boundary", () => {
    expect(utcDateKey(Date.UTC(2026, 0, 1, 0, 30))).toBe("2026-01-01");
    expect(utcDateKey(Date.UTC(2025, 11, 31, 23, 30))).toBe("2025-12-31");
  });
});

describe("recentUtcDateKeys", () => {
  test("returns today first, then prior dates, newest to oldest", () => {
    expect(recentUtcDateKeys(NOW, 3)).toEqual([
      "2026-05-26",
      "2026-05-25",
      "2026-05-24",
    ]);
  });

  test("crosses month boundaries", () => {
    const firstOfMonth = Date.UTC(2026, 2, 1, 12);
    expect(recentUtcDateKeys(firstOfMonth, 2)).toEqual([
      "2026-03-01",
      "2026-02-28",
    ]);
  });
});

describe("summarizeSpend", () => {
  test("buckets spend into trailing day/week/month windows", () => {
    const byDate = new Map<string, number>([
      [utcDateKey(NOW), 1], // today
      [utcDateKey(NOW - 3 * DAY), 2], // within week + month
      [utcDateKey(NOW - 10 * DAY), 4], // within month only
      [utcDateKey(NOW - 40 * DAY), 8], // outside every window
    ]);
    expect(summarizeSpend(byDate, NOW)).toEqual({
      day: 1,
      week: 3,
      month: 7,
    });
  });

  test("works with a plain record and ignores missing/NaN values", () => {
    const byDate: Record<string, number> = {
      [utcDateKey(NOW)]: 5,
      [utcDateKey(NOW - DAY)]: Number.NaN,
    };
    expect(summarizeSpend(byDate, NOW)).toEqual({ day: 5, week: 5, month: 5 });
  });

  test("empty input is all zero", () => {
    expect(summarizeSpend(new Map(), NOW)).toEqual({
      day: 0,
      week: 0,
      month: 0,
    });
  });

  test("the day-6 boundary still counts toward the week window", () => {
    const lastWeekDay = SPEND_WINDOW_DAYS.week - 1; // 6 days ago
    const byDate = new Map<string, number>([
      [utcDateKey(NOW - lastWeekDay * DAY), 3],
      [utcDateKey(NOW - SPEND_WINDOW_DAYS.week * DAY), 9], // 7 days ago: out
    ]);
    const out = summarizeSpend(byDate, NOW);
    expect(out.week).toBe(3);
    expect(out.month).toBe(12);
  });
});
