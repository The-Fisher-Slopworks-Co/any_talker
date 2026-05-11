// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { isValidTimezone } from "./types";

export type LocalParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

// Constructing Intl.DateTimeFormat is expensive; the checks scheduler calls
// these helpers on every tick for every check, so cache per (kind, tz).
const localPartsFormatters = new Map<string, Intl.DateTimeFormat>();
const offsetFormatters = new Map<string, Intl.DateTimeFormat>();

function localPartsFormatter(tz: string): Intl.DateTimeFormat {
  let f = localPartsFormatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    localPartsFormatters.set(tz, f);
  }
  return f;
}

function offsetFormatter(tz: string): Intl.DateTimeFormat {
  let f = offsetFormatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      timeZoneName: "longOffset",
    });
    offsetFormatters.set(tz, f);
  }
  return f;
}

export function formatLocalParts(utcMs: number, tz: string): LocalParts {
  const parts = localPartsFormatter(tz).formatToParts(new Date(utcMs));
  const get = (t: string) =>
    Number(parts.find((p) => p.type === t)?.value ?? "0");
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
  };
}

export function tzOffsetMinutesAt(utcMs: number, tz: string): number {
  const parts = offsetFormatter(tz).formatToParts(new Date(utcMs));
  const off =
    parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT+00:00";
  const m = off.match(/GMT([+-])(\d{1,2}):?(\d{2})?/);
  if (!m) return 0;
  const sign = m[1] === "+" ? 1 : -1;
  const hours = Number(m[2]);
  const minutes = Number(m[3] ?? "0");
  return sign * (hours * 60 + minutes);
}

export type WallClockResult =
  | { ok: true; ms: number }
  | { ok: false; reason: "invalid_timezone" | "nonexistent_local_time" };

export function wallClockToUtcMs(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timezone: string,
): WallClockResult {
  if (!isValidTimezone(timezone)) {
    return { ok: false, reason: "invalid_timezone" };
  }

  const utcGuess = Date.UTC(year, month - 1, day, hour, minute);
  const offsetGuess = tzOffsetMinutesAt(utcGuess, timezone);
  const utcCandidate = utcGuess - offsetGuess * 60_000;
  const offsetActual = tzOffsetMinutesAt(utcCandidate, timezone);
  const ms =
    offsetActual === offsetGuess
      ? utcCandidate
      : utcGuess - offsetActual * 60_000;

  const local = formatLocalParts(ms, timezone);
  if (
    local.year !== year ||
    local.month !== month ||
    local.day !== day ||
    local.hour !== hour ||
    local.minute !== minute
  ) {
    return { ok: false, reason: "nonexistent_local_time" };
  }

  return { ok: true, ms };
}

const DATETIME_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

export function parseAbsoluteDateTimeMs(
  datetime: string,
  timezone: string,
): { ok: true; ms: number } | { ok: false; reason: string } {
  const m = datetime.match(DATETIME_RE);
  if (!m) {
    return {
      ok: false,
      reason: "datetime must match YYYY-MM-DDTHH:MM (no seconds, no offset)",
    };
  }
  const res = wallClockToUtcMs(
    Number(m[1]),
    Number(m[2]),
    Number(m[3]),
    Number(m[4]),
    Number(m[5]),
    timezone,
  );
  if (res.ok) return { ok: true, ms: res.ms };
  if (res.reason === "invalid_timezone") {
    return { ok: false, reason: `invalid timezone: ${timezone}` };
  }
  return {
    ok: false,
    reason:
      "this wall-clock time does not exist in the user's timezone (likely a DST spring-forward gap); pick a time before or after the gap",
  };
}
