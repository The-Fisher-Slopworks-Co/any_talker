// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

// The "+X% to limits until <date>" promo. Pure: the boost lives in `Settings`
// and is applied at read time, so it switches itself off at `untilMs` without
// a scheduler or a write.

import type { LimitBoost, RateLimitConfig } from "../shared/types";

// Upper bound on a promo, so a typo can't hand out a practically unlimited
// budget (+1000% = 11x the base).
export const MAX_BOOST_PERCENT = 1000;

// Shape check shared by the settings API (write) and `normalize` (read).
export function isValidLimitBoost(v: unknown): v is LimitBoost {
  const b = v as Partial<LimitBoost> | null;
  return (
    typeof b === "object" &&
    b !== null &&
    Number.isInteger(b.percent) &&
    b.percent! >= 1 &&
    b.percent! <= MAX_BOOST_PERCENT &&
    typeof b.untilMs === "number" &&
    Number.isFinite(b.untilMs)
  );
}

// The boost if it is still running at `now`, else null.
export function activeBoost(
  boost: LimitBoost | null,
  now: number,
): LimitBoost | null {
  return boost && now < boost.untilMs ? boost : null;
}

// The budgets users are actually held to at `now`: the base ones, raised by the
// active boost's percentage (rounded down to whole tokens).
export function boostedRateLimit(
  config: RateLimitConfig,
  boost: LimitBoost | null,
  now: number,
): RateLimitConfig {
  const active = activeBoost(boost, now);
  if (!active) return config;
  const factor = 1 + active.percent / 100;
  return {
    ...config,
    fiveHourTokens: Math.floor(config.fiveHourTokens * factor),
    weeklyTokens: Math.floor(config.weeklyTokens * factor),
  };
}
