// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

// Hard USD budget caps, enforced by the budget guard alongside (and independent
// of) the token rate limit — money vs. fairness. Checked most-severe-first, so
// when several caps are breached at once the guard reports the top one.
export type BudgetDenyReason =
  "globalMonthly" | "globalDaily" | "chatDaily" | "newUser";

// USD spend caps. The primary protector of a fixed monthly budget is
// `globalMonthlyCapUsd`; the daily/chat/new-user caps bound how fast that budget
// can be drained by any single day, chat, or freshly-seen (untrusted) user. All
// are admin-editable at runtime; window *lengths* (day/month) are fixed in the
// spend-bucket math. The owner is never denied when `ownerExempt` (default true),
// but owner spend still counts toward the global totals — the money is real.
export type BudgetConfig = {
  enabled: boolean;
  ownerExempt: boolean;
  globalMonthlyCapUsd: number;
  globalDailyCapUsd: number;
  perChatDailyCapUsd: number;
  newUserDailyCapUsd: number;
  // How long (days from first-seen) a user is treated as "new" and held to the
  // tighter `newUserDailyCapUsd`.
  newUserWindowDays: number;
};

// Anomaly-detection thresholds for the observability layer (alert-only — these
// never deny a request, unlike `BudgetConfig`). A spend "spike" fires when a
// user's/chat's spend today crosses EITHER the absolute floor OR a multiple of
// its own trailing baseline (velocity), so a sudden jump is caught even below
// the absolute bar. The velocity signal is floored by `spikeMinBaselineUsd` so
// trivial amounts (a few cents) can't trip it.
export type AnomalyConfig = {
  digestIntervalHours: number;
  spikeUserAbsoluteUsd: number;
  spikeChatAbsoluteUsd: number;
  spikeVelocityMultiplier: number;
  spikeMinBaselineUsd: number;
};
