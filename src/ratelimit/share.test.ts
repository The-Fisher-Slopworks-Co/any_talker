// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { usageShare } from "./share";
import { summarizeUsage } from "./window";
import type { RateLimitConfig } from "../shared/types";
import type { UsageStatus, WindowStatus } from "./window";

const CONFIG: RateLimitConfig = {
  fiveHourTokens: 1000,
  weeklyTokens: 10_000,
  ownerExempt: true,
  wiseMultiplier: 2,
};

const NOW = 1_700_000_000_000;

function win(used: number, limit: number): WindowStatus {
  return {
    used,
    limit,
    windowStart: NOW,
    resetMs: NOW + 1000,
    remaining: Math.max(0, limit - used),
  };
}

const status = (five: WindowStatus, weekly: WindowStatus): UsageStatus => ({
  fiveHour: five,
  weekly,
});

describe("usageShare", () => {
  test("reports used/remaining as complementary integer percentages", () => {
    const share = usageShare(status(win(250, 1000), win(1000, 10_000)), false);
    expect(share.fiveHour.usedPercent).toBe(25);
    expect(share.fiveHour.remainingPercent).toBe(75);
    expect(share.weekly.usedPercent).toBe(10);
    expect(share.weekly.remainingPercent).toBe(90);
    expect(share.exempt).toBe(false);
  });

  test("carries the reset timestamp through untouched", () => {
    const share = usageShare(status(win(0, 1000), win(0, 10_000)), false);
    expect(share.fiveHour.resetMs).toBe(NOW + 1000);
    expect(share.weekly.resetMs).toBe(NOW + 1000);
  });

  test("exposes no token counts at all", () => {
    const share = usageShare(status(win(250, 1000), win(1234, 10_000)), false);
    const json = JSON.stringify(share);
    for (const key of ["used", "limit", "remaining", "windowStart"]) {
      expect(json).not.toContain(`"${key}"`);
    }
    // The raw figures themselves must not survive as values either.
    expect(json).not.toContain("1234");
    expect(json).not.toContain("10000");
  });

  test("rounds to whole percents", () => {
    expect(usageShare(status(win(126, 1000), win(0, 10)), false).fiveHour
      .usedPercent).toBe(13);
    expect(usageShare(status(win(124, 1000), win(0, 10)), false).fiveHour
      .usedPercent).toBe(12);
  });

  test("any spend shows as at least 1%, never a 0% bar", () => {
    const share = usageShare(status(win(1, 100_000), win(0, 10)), false);
    expect(share.fiveHour.usedPercent).toBe(1);
    expect(share.fiveHour.remainingPercent).toBe(99);
  });

  test("zero used stays 0%", () => {
    expect(
      usageShare(status(win(0, 1000), win(0, 10)), false).fiveHour.usedPercent,
    ).toBe(0);
  });

  test("clamps overshoot to 100% (a window can be overspent by one turn)", () => {
    const share = usageShare(status(win(1500, 1000), win(0, 10)), false);
    expect(share.fiveHour.usedPercent).toBe(100);
    expect(share.fiveHour.remainingPercent).toBe(0);
  });

  test("a non-positive budget reads as fully spent, not NaN", () => {
    const share = usageShare(status(win(0, 0), win(0, -5)), false);
    expect(share.fiveHour.usedPercent).toBe(100);
    expect(share.weekly.usedPercent).toBe(100);
  });

  test("passes the exempt flag through", () => {
    expect(
      usageShare(status(win(0, 1000), win(0, 10_000)), true).exempt,
    ).toBe(true);
  });

  test("composes with summarizeUsage on a fresh user", () => {
    const share = usageShare(
      summarizeUsage("u1", CONFIG, null, NOW),
      false,
    );
    expect(share.fiveHour.usedPercent).toBe(0);
    expect(share.weekly.remainingPercent).toBe(100);
    expect(share.fiveHour.resetMs).toBeGreaterThan(NOW);
  });
});
