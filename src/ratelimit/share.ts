// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

// Percentage view of the dual-window rate limit — the ONLY shape a non-owner is
// ever shown. `UsageStatus` carries raw token counts (used/limit); those are
// operational detail the bot deliberately keeps to itself, so both user-facing
// surfaces (`/usage` in a DM and the Web App header) render from this type and
// never see a token number. Pure math, no I/O: `summarizeUsage` resolves the
// windows, this collapses them to a share of budget.

import type { UsageStatus, WindowStatus } from "./window";

export type WindowShare = {
  // Share of this window's budget already spent, 0..100, integer.
  usedPercent: number;
  // 100 - usedPercent, so callers don't recompute (and can't disagree).
  remainingPercent: number;
  // Epoch ms when the window rolls over. A timestamp, not a token count — safe
  // to show, and the only way "42% left" means anything.
  resetMs: number;
};

export type UsageShare = {
  fiveHour: WindowShare;
  weekly: WindowShare;
  // True when the viewer is the owner AND `rateLimit.ownerExempt` — no tokens
  // are deducted for them at all, so the percentages would sit at 0 forever.
  // Surfaces render "no limit" instead of a permanently empty bar.
  exempt: boolean;
};

function shareOf(w: WindowStatus): WindowShare {
  // A non-positive budget means nothing may be spent — report it as full rather
  // than dividing by zero.
  const raw = w.limit > 0 ? (w.used / w.limit) * 100 : 100;
  // Any spend at all shows as at least 1%: rounding a real (if tiny) usage down
  // to a "0% used" bar would read as "nothing spent yet", which is false.
  const rounded = raw > 0 && raw < 1 ? 1 : Math.round(raw);
  const usedPercent = Math.max(0, Math.min(100, rounded));
  return {
    usedPercent,
    remainingPercent: 100 - usedPercent,
    resetMs: w.resetMs,
  };
}

export function usageShare(status: UsageStatus, exempt: boolean): UsageShare {
  return {
    fiveHour: shareOf(status.fiveHour),
    weekly: shareOf(status.weekly),
    exempt,
  };
}
