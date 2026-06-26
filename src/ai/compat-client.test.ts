// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { computeCostUsd } from "./compat-client";
import type { PriceLookup, ModelPricing } from "./model-catalog";

const lookup = (pricing: ModelPricing | null): PriceLookup => ({
  getPricing: () => pricing,
});

describe("computeCostUsd", () => {
  test("inputTokens × promptPrice + outputTokens × completionPrice", () => {
    const pricing = { promptPerToken: 0.000001, completionPerToken: 0.000002 };
    // 1000 × 1e-6 + 500 × 2e-6 = 0.001 + 0.001 = 0.002
    expect(computeCostUsd(lookup(pricing), "m", 1000, 500)).toBeCloseTo(0.002, 9);
  });

  test("returns 0 when the model has no pricing", () => {
    expect(computeCostUsd(lookup(null), "unpriced", 1000, 500)).toBe(0);
  });

  test("returns 0 for zero token usage even when priced", () => {
    const pricing = { promptPerToken: 0.000001, completionPerToken: 0.000002 };
    expect(computeCostUsd(lookup(pricing), "m", 0, 0)).toBe(0);
  });
});
