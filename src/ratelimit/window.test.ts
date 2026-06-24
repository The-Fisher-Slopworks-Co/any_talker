// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import {
  SLOT_MS,
  FIVE_HOUR_MS,
  WEEK_MS,
  hashUserId,
  windowOffset,
  windowStart,
  currentWindowStarts,
  summarizeUsage,
} from "./window";
import type { RateLimitConfig, UserUsage } from "../shared/types";

const cfg: RateLimitConfig = {
  fiveHourTokens: 100,
  weeklyTokens: 1000,
  ownerExempt: true,
  wiseMultiplier: 1.8,
};

describe("hashUserId", () => {
  test("is deterministic and unsigned", () => {
    expect(hashUserId("42")).toBe(hashUserId("42"));
    expect(hashUserId("42")).toBeGreaterThanOrEqual(0);
    expect(hashUserId("42")).not.toBe(hashUserId("43"));
  });
});

describe("windowOffset", () => {
  test("is a multiple of SLOT_MS and below the window length", () => {
    for (const id of ["1", "42", "1000", "-100", "999999999"]) {
      const off5 = windowOffset(id, FIVE_HOUR_MS);
      expect(off5 % SLOT_MS).toBe(0);
      expect(off5).toBeGreaterThanOrEqual(0);
      expect(off5).toBeLessThan(FIVE_HOUR_MS);

      const offW = windowOffset(id, WEEK_MS);
      expect(offW % SLOT_MS).toBe(0);
      expect(offW).toBeLessThan(WEEK_MS);
    }
  });

  test("5-hour window has 30 slots, weekly has 1008", () => {
    expect(FIVE_HOUR_MS / SLOT_MS).toBe(30);
    expect(WEEK_MS / SLOT_MS).toBe(1008);
  });

  test("any two users' offsets differ by a whole number of 10-minute slots", () => {
    const a = windowOffset("42", FIVE_HOUR_MS);
    const b = windowOffset("43", FIVE_HOUR_MS);
    expect((a - b) % SLOT_MS === 0).toBe(true);
  });
});

describe("windowStart", () => {
  test("contains now and is aligned to the user's phase", () => {
    const now = 1_700_000_123_456;
    for (const id of ["1", "42", "abc"]) {
      const start = windowStart(id, FIVE_HOUR_MS, now);
      expect(start).toBeLessThanOrEqual(now);
      expect(now).toBeLessThan(start + FIVE_HOUR_MS);
      // start - offset is an exact multiple of the window length.
      const off = windowOffset(id, FIVE_HOUR_MS);
      expect((start - off) % FIVE_HOUR_MS).toBe(0);
    }
  });

  test("is stable within a window and advances by exactly one length at the boundary", () => {
    const id = "42";
    const start = windowStart(id, FIVE_HOUR_MS, 1_700_000_000_000);
    expect(windowStart(id, FIVE_HOUR_MS, start)).toBe(start);
    expect(windowStart(id, FIVE_HOUR_MS, start + FIVE_HOUR_MS - 1)).toBe(start);
    expect(windowStart(id, FIVE_HOUR_MS, start + FIVE_HOUR_MS)).toBe(
      start + FIVE_HOUR_MS,
    );
  });

  test("currentWindowStarts matches windowStart for both windows", () => {
    const now = 1_700_000_777_777;
    const s = currentWindowStarts("42", now);
    expect(s.fiveHour).toBe(windowStart("42", FIVE_HOUR_MS, now));
    expect(s.weekly).toBe(windowStart("42", WEEK_MS, now));
  });
});

describe("summarizeUsage", () => {
  const now = 1_700_000_000_000;

  test("no stored record → both windows at zero used, full remaining", () => {
    const u = summarizeUsage("42", cfg, null, now);
    expect(u.fiveHour.used).toBe(0);
    expect(u.fiveHour.limit).toBe(100);
    expect(u.fiveHour.remaining).toBe(100);
    expect(u.weekly.used).toBe(0);
    expect(u.weekly.remaining).toBe(1000);
    expect(u.fiveHour.resetMs).toBe(
      windowStart("42", FIVE_HOUR_MS, now) + FIVE_HOUR_MS,
    );
  });

  test("stored record in the current window counts; remaining is clamped at 0", () => {
    const starts = currentWindowStarts("42", now);
    const stored: UserUsage = {
      fiveHour: { windowStart: starts.fiveHour, used: 150 },
      weekly: { windowStart: starts.weekly, used: 200 },
    };
    const u = summarizeUsage("42", cfg, stored, now);
    expect(u.fiveHour.used).toBe(150);
    expect(u.fiveHour.remaining).toBe(0); // clamped, even though over the limit
    expect(u.weekly.used).toBe(200);
    expect(u.weekly.remaining).toBe(800);
  });

  test("a stale window (old start) reads as empty", () => {
    const starts = currentWindowStarts("42", now);
    const stored: UserUsage = {
      // Previous 5-hour window: must not count toward the current one.
      fiveHour: { windowStart: starts.fiveHour - FIVE_HOUR_MS, used: 99 },
      weekly: { windowStart: starts.weekly, used: 50 },
    };
    const u = summarizeUsage("42", cfg, stored, now);
    expect(u.fiveHour.used).toBe(0);
    expect(u.weekly.used).toBe(50);
  });
});
