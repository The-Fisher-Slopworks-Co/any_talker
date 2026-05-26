// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

// Per-user spend is bucketed by UTC calendar date. The day/week/month figures
// shown in the UI are trailing windows over those daily buckets: "day" is
// today, "week" is the last 7 dates, "month" is the last 30 dates. UTC keeps
// recording (on the hot request path) and reading (in the admin/self views)
// consistent without threading a timezone through every call site.

export type SpendSummary = {
  day: number;
  week: number;
  month: number;
};

export const SPEND_WINDOW_DAYS = { day: 1, week: 7, month: 30 } as const;

// Daily buckets are retained a few days past the longest window so the 30-day
// "month" total stays complete while abandoned buckets eventually expire.
export const SPEND_RETENTION_DAYS = 35;

const MS_PER_DAY = 86_400_000;

// "YYYY-MM-DD" in UTC. Fixed-width and zero-padded, so keys sort lexically by
// date — relied on for pruning in MemoryStorage.
export function utcDateKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

// The trailing `days` calendar dates ending at `nowMs`, today first.
export function recentUtcDateKeys(nowMs: number, days: number): string[] {
  const keys: string[] = [];
  for (let i = 0; i < days; i++) {
    keys.push(utcDateKey(nowMs - i * MS_PER_DAY));
  }
  return keys;
}

// Sums a per-date spend map into trailing day/week/month windows.
export function summarizeSpend(
  byDate: ReadonlyMap<string, number> | Readonly<Record<string, number>>,
  nowMs: number,
): SpendSummary {
  const read = (k: string): number => {
    const v = byDate instanceof Map ? byDate.get(k) : (byDate as Record<string, number>)[k];
    return typeof v === "number" && Number.isFinite(v) ? v : 0;
  };
  const dates = recentUtcDateKeys(nowMs, SPEND_WINDOW_DAYS.month);
  let day = 0;
  let week = 0;
  let month = 0;
  for (let i = 0; i < dates.length; i++) {
    const v = read(dates[i]!);
    month += v;
    if (i < SPEND_WINDOW_DAYS.week) week += v;
    if (i < SPEND_WINDOW_DAYS.day) day += v;
  }
  return { day, week, month };
}
