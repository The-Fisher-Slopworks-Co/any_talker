// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

// Dual fixed-window token budget, per user (global across all chats and family
// bots). A request is allowed only while BOTH windows have budget left; tokens
// spent are accrued to both. Window *lengths* are fixed in code (5 hours and 1
// week); only these budgets and the multiplier/exemption are admin-configurable.
export type RateLimitConfig = {
  fiveHourTokens: number;
  weeklyTokens: number;
  ownerExempt: boolean;
  wiseMultiplier: number;
};

// Which of the two windows is being referred to (denial reason, UI labels).
export type WindowKind = "fiveHour" | "weekly";

// One fixed window's accounting: the start (epoch ms) it was accrued against
// and the tokens used within it. A stored window whose start no longer matches
// the current (deterministically phase-shifted) window is treated as empty.
type UsageWindow = {
  windowStart: number;
  used: number;
};

// Per-user dual-window usage record (see `RateLimitConfig`).
export type UserUsage = {
  fiveHour: UsageWindow;
  weekly: UsageWindow;
};

// Admin-run promo: every user's budgets (both windows) are raised by `percent`
// until `untilMs` (epoch ms), after which the base budgets apply again on their
// own — no cleanup job, an expired boost is simply ignored on read.
export type LimitBoost = {
  percent: number;
  untilMs: number;
};

// Per-user limit class, assigned by the admin by hand. A user without one is
// held to the base limits; a class raises them by its `LimitClassConfig`.
export const LIMIT_CLASSES = [1, 2] as const;
export type LimitClass = (typeof LIMIT_CLASSES)[number];

export function isLimitClass(v: unknown): v is LimitClass {
  return LIMIT_CLASSES.includes(v as LimitClass);
}

// What a class raises. Both only ever raise: `tokenMultiplier` is floored at 1,
// and the reminder cap never drops below the global `maxRemindersPerUser`.
export type LimitClassConfig = {
  // Applied to both token windows, before any running promo.
  tokenMultiplier: number;
  maxReminders: number;
};

export type LimitClassesConfig = Record<LimitClass, LimitClassConfig>;
