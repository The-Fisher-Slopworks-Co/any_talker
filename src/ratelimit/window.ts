// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

// Pure math for the dual fixed-window rate limit (5-hour + weekly), mirroring
// the role `spending/window.ts` plays for spend accounting. No I/O, no clock:
// every function takes `now` and the user id explicitly, so it is trivially
// unit-testable.
//
// Each window is a fixed-length block whose phase is shifted per user by a
// deterministic offset, so users' resets are staggered across wall-clock time
// instead of all landing on the same boundary. The offset is quantized to
// 10-minute slots, so any two users' boundaries differ by a whole number of
// 10-minute steps. Because the offset is derived from the user id (not from
// first use), `windowStart` is a pure function of `now` — there is no anchor to
// persist; the stored record only needs the window start its `used` belongs to,
// so a stale window reads as empty.

import type { RateLimitConfig, UserUsage } from "../shared/types";

export const SLOT_MS = 10 * 60 * 1000; // phase-offset granularity: 10 minutes
export const FIVE_HOUR_MS = 5 * 60 * 60 * 1000; // 18_000_000
export const WEEK_MS = 7 * 24 * 60 * 60 * 1000; // 604_800_000

// Stored usage auto-expires this long after its last write. The weekly window
// plus two days of slack: once both windows are stale a record is meaningless,
// so letting idle users' keys expire keeps the keyspace bounded (the old
// per-(chat,user) buckets had no TTL and accumulated forever).
export const USAGE_RETENTION_MS = WEEK_MS + 2 * 24 * 60 * 60 * 1000;
export const USAGE_RETENTION_SECONDS = Math.floor(USAGE_RETENTION_MS / 1000);

// FNV-1a 32-bit hash of the user id, returned unsigned. Deterministic and
// stable across restarts, so a user's window phase never moves.
export function hashUserId(userId: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < userId.length; i++) {
    h ^= userId.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// Per-user phase offset (epoch-ms modulo `lengthMs`) for a window of the given
// length, quantized to `SLOT_MS`. `lengthMs / SLOT_MS` distinct slots: 30 for
// the 5-hour window, 1008 for the weekly one.
export function windowOffset(userId: string, lengthMs: number): number {
  const slots = Math.floor(lengthMs / SLOT_MS);
  return (hashUserId(userId) % slots) * SLOT_MS;
}

// Start (epoch ms) of the fixed window of length `lengthMs` containing `now`,
// shifted by the user's phase offset: windowStart ≤ now < windowStart + lengthMs.
export function windowStart(
  userId: string,
  lengthMs: number,
  now: number,
): number {
  const offset = windowOffset(userId, lengthMs);
  return Math.floor((now - offset) / lengthMs) * lengthMs + offset;
}

// The current window starts for both windows, as passed into `addUserUsage`.
export function currentWindowStarts(
  userId: string,
  now: number,
): { fiveHour: number; weekly: number } {
  return {
    fiveHour: windowStart(userId, FIVE_HOUR_MS, now),
    weekly: windowStart(userId, WEEK_MS, now),
  };
}

export type WindowStatus = {
  used: number;
  limit: number;
  windowStart: number;
  // Epoch ms when this window next resets (its start + length).
  resetMs: number;
  // limit - used, floored at 0 (for display / the allowed decision).
  remaining: number;
};

export type UsageStatus = {
  fiveHour: WindowStatus;
  weekly: WindowStatus;
};

function statusFor(
  userId: string,
  lengthMs: number,
  limit: number,
  stored: { windowStart: number; used: number } | undefined,
  now: number,
): WindowStatus {
  const start = windowStart(userId, lengthMs, now);
  // Stored usage only counts if it belongs to the current window; otherwise the
  // window has rolled over and the budget is fresh.
  const used = stored && stored.windowStart === start ? stored.used : 0;
  return {
    used,
    limit,
    windowStart: start,
    resetMs: start + lengthMs,
    remaining: Math.max(0, limit - used),
  };
}

// Resolves a stored record (or its absence) against the current windows for a
// user, producing the effective used/limit/reset for each. Shared by the
// limiter's `check` and the admin API's read endpoints.
export function summarizeUsage(
  userId: string,
  config: RateLimitConfig,
  stored: UserUsage | null,
  now: number,
): UsageStatus {
  return {
    fiveHour: statusFor(
      userId,
      FIVE_HOUR_MS,
      config.fiveHourTokens,
      stored?.fiveHour,
      now,
    ),
    weekly: statusFor(
      userId,
      WEEK_MS,
      config.weeklyTokens,
      stored?.weekly,
      now,
    ),
  };
}
