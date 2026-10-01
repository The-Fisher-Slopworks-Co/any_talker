// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

// What an admin-assigned limit class does to a user's limits. Pure: the class
// is read by the caller, its config lives in `Settings`.

import type { LimitClass, RateLimitConfig, Settings } from "../shared/types";
import { boostedRateLimit } from "./boost";

// The USD budgets a user is held to at `now`: the base ones, raised by their
// class's multiplier, then by the running promo on top (the two multiply).
export function userRateLimit(
  settings: Settings,
  limitClass: LimitClass | null,
  now: number,
): RateLimitConfig {
  const base = settings.rateLimit;
  const factor =
    limitClass === null ? 1 : settings.limitClasses[limitClass].limitMultiplier;
  const classed =
    factor === 1
      ? base
      : {
          ...base,
          fiveHourUsd: base.fiveHourUsd * factor,
          weeklyUsd: base.weeklyUsd * factor,
        };
  return boostedRateLimit(classed, settings.limitBoost, now);
}

// How many active reminders the user may hold. A class never lowers the cap,
// even if its value is set below the global one.
export function userReminderCap(
  settings: Settings,
  limitClass: LimitClass | null,
): number {
  if (limitClass === null) return settings.maxRemindersPerUser;
  return Math.max(
    settings.maxRemindersPerUser,
    settings.limitClasses[limitClass].maxReminders,
  );
}
