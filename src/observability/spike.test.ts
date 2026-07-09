// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { detectSpike } from "./spike";

const cfg = { absoluteUsd: 1, velocityMultiplier: 5, minBaselineUsd: 0.02 };

describe("detectSpike", () => {
  test("no spend is not a spike", () => {
    expect(detectSpike({ day: 0, week: 0, month: 0 }, cfg).isSpike).toBe(false);
  });

  test("crossing the absolute floor is a spike regardless of baseline", () => {
    // Steady $1.20/day: over the absolute floor even though it's not a jump.
    expect(detectSpike({ day: 1.2, week: 8.4, month: 36 }, cfg).isSpike).toBe(true);
  });

  test("velocity: a jump over 5× the recent baseline is a spike below the floor", () => {
    // Prior 6 days ≈ $0.10/day (baseline), today $0.6 = 6× → spike, still under $1.
    const r = detectSpike({ day: 0.6, week: 0.6 + 0.6, month: 1.2 }, cfg);
    expect(r.baseline).toBeCloseTo(0.1);
    expect(r.isSpike).toBe(true);
  });

  test("steady low spend within the multiplier is not a spike", () => {
    // ~$0.10/day every day: today $0.10, baseline $0.10, 1× → not a spike.
    expect(detectSpike({ day: 0.1, week: 0.7, month: 3 }, cfg).isSpike).toBe(false);
  });

  test("minBaseline floor stops a near-zero history flagging trivial amounts", () => {
    // No prior spend, today $0.05. Baseline floored to $0.02, 5× = $0.10 > $0.05,
    // and $0.05 < $1 absolute → not a spike.
    expect(detectSpike({ day: 0.05, week: 0.05, month: 0.05 }, cfg).isSpike).toBe(
      false,
    );
  });
});
