// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { formatLocalParts, wallClockToUtcMs } from "../shared/tz";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// Most recent UTC ms at which the (hour:minute, timezone) schedule fired
// at or before `nowMs`. If the schedule's exact wall-clock time does not
// exist today (DST spring-forward gap), the next available local time later
// in the day is used.
export function lastScheduledFireMs(
  nowMs: number,
  scheduleHour: number,
  scheduleMinute: number,
  timezone: string,
): number {
  const todayMs = computeFireForLocalDate(nowMs, scheduleHour, scheduleMinute, timezone);
  if (todayMs !== null && todayMs <= nowMs) return todayMs;

  const yesterdayNowMs = nowMs - ONE_DAY_MS;
  const yesterdayMs = computeFireForLocalDate(
    yesterdayNowMs,
    scheduleHour,
    scheduleMinute,
    timezone,
  );
  if (yesterdayMs !== null) return yesterdayMs;

  return nowMs - ONE_DAY_MS;
}

function computeFireForLocalDate(
  anchorMs: number,
  scheduleHour: number,
  scheduleMinute: number,
  timezone: string,
): number | null {
  const local = formatLocalParts(anchorMs, timezone);
  const res = wallClockToUtcMs(
    local.year,
    local.month,
    local.day,
    scheduleHour,
    scheduleMinute,
    timezone,
  );
  if (res.ok) return res.ms;

  if (res.reason === "nonexistent_local_time") {
    for (let bump = 1; bump <= 60; bump++) {
      const minute = (scheduleMinute + bump) % 60;
      const hourBump = Math.floor((scheduleMinute + bump) / 60);
      const hour = scheduleHour + hourBump;
      if (hour > 23) return null;
      const r = wallClockToUtcMs(
        local.year,
        local.month,
        local.day,
        hour,
        minute,
        timezone,
      );
      if (r.ok) return r.ms;
    }
  }
  return null;
}
