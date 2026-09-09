// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { Reminder, RecurrenceSpec } from "./types";
import { formatLocalParts, wallClockToUtcMs } from "../shared/tz";
import { isValidTimezone } from "../shared/types";

// A calendar series that cannot produce a valid instant within this many steps
// is abandoned rather than looped over. Only a broken timezone or a
// pathological rule gets near it; a year of daily fires is 365.
const MAX_CALENDAR_STEPS = 400;

type LocalDate = { year: number; month: number; day: number };

function addLocalDays(date: LocalDate, days: number): LocalDate {
  const d = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
  };
}

// The instant a series fires at after the occurrence at `prevFireAtMs`, or
// null when it cannot produce one (a malformed spec, a timezone that no longer
// resolves) and the series has to end.
//
// The result is derived from `prevFireAtMs`, never from the wall clock, so
// re-running this for the same stored occurrence always yields the same
// answer: a tick retried after a crash re-schedules to the very same instant
// instead of drifting a run forward. `nowMs` only decides how many whole
// periods to skip when the scheduler was down long enough to miss some — the
// series keeps its phase and does not fire a backlog all at once.
export function computeNextFireAtMs(
  spec: RecurrenceSpec,
  prevFireAtMs: number,
  nowMs: number,
): number | null {
  if (spec.kind === "interval") {
    if (!Number.isFinite(spec.everyMs) || spec.everyMs <= 0) return null;
    const elapsed = nowMs - prevFireAtMs;
    const periods = elapsed < 0 ? 1 : Math.floor(elapsed / spec.everyMs) + 1;
    return prevFireAtMs + periods * spec.everyMs;
  }
  if (!Number.isInteger(spec.everyDays) || spec.everyDays <= 0) return null;
  // Checked before use: `formatLocalParts` throws on a timezone the runtime
  // does not know, and a stored series outlives the tz database it was written
  // against.
  if (!isValidTimezone(spec.timezone)) return null;
  let date: LocalDate = formatLocalParts(prevFireAtMs, spec.timezone);
  for (let step = 0; step < MAX_CALENDAR_STEPS; step++) {
    date = addLocalDays(date, spec.everyDays);
    const at = wallClockToUtcMs(
      date.year,
      date.month,
      date.day,
      spec.hour,
      spec.minute,
      spec.timezone,
    );
    // A wall-clock time that does not exist on this particular date (a DST
    // spring-forward gap) costs that one occurrence and no more; an instant
    // already in the past is a run missed while the scheduler was down.
    if (at.ok && at.ms > nowMs) return at.ms;
  }
  return null;
}

// The same reminder moved to its next occurrence, or null when the series is
// over — the last allowed fire has just been delivered, or no next instant
// could be computed. A null answer means the caller deletes the record exactly
// as it does for a delivered one-shot.
export function advanceRecurrence(
  reminder: Reminder,
  nowMs: number,
): Reminder | null {
  const recurrence = reminder.recurrence;
  if (!recurrence) return null;
  if (recurrence.occurrencesLeft <= 1) return null;
  const fireAtMs = computeNextFireAtMs(
    recurrence.spec,
    reminder.fireAtMs,
    nowMs,
  );
  if (fireAtMs === null) return null;
  return {
    ...reminder,
    fireAtMs,
    recurrence: {
      ...recurrence,
      occurrencesLeft: recurrence.occurrencesLeft - 1,
    },
  };
}
