// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { DEFAULT_SETTINGS } from "../shared/types";
import { activeBoost, boostedRateLimit, isValidLimitBoost } from "./boost";

const NOW = 1_700_000_000_000;
const BASE = {
  ...DEFAULT_SETTINGS.rateLimit,
  fiveHourTokens: 1000,
  weeklyTokens: 10_001,
};

describe("boostedRateLimit", () => {
  test("raises both budgets by the percent while the promo runs", () => {
    const r = boostedRateLimit(BASE, { percent: 50, untilMs: NOW + 1 }, NOW);
    expect(r.fiveHourTokens).toBe(1500);
    expect(r.weeklyTokens).toBe(15_001);
    expect(r.wiseMultiplier).toBe(BASE.wiseMultiplier);
    expect(r.ownerExempt).toBe(BASE.ownerExempt);
  });

  test("returns the base budgets once the promo has ended", () => {
    const boost = { percent: 50, untilMs: NOW };
    expect(boostedRateLimit(BASE, boost, NOW)).toBe(BASE);
    expect(activeBoost(boost, NOW)).toBeNull();
    expect(activeBoost(boost, NOW - 1)).toBe(boost);
  });

  test("returns the base budgets with no promo", () => {
    expect(boostedRateLimit(BASE, null, NOW)).toBe(BASE);
  });
});

describe("isValidLimitBoost", () => {
  test("accepts a whole percent in range with a finite end", () => {
    expect(isValidLimitBoost({ percent: 1, untilMs: NOW })).toBe(true);
    expect(isValidLimitBoost({ percent: 1000, untilMs: NOW })).toBe(true);
  });

  test("rejects anything else", () => {
    for (const bad of [
      null,
      "50",
      { percent: 0, untilMs: NOW },
      { percent: 1001, untilMs: NOW },
      { percent: 12.5, untilMs: NOW },
      { percent: 50 },
      { percent: 50, untilMs: Infinity },
      { percent: "50", untilMs: NOW },
    ]) {
      expect(isValidLimitBoost(bad)).toBe(false);
    }
  });
});
