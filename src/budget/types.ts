// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { BudgetConfig, BudgetDenyReason } from "../shared/types";

export type BudgetCheckResult =
  | { allowed: true }
  | { allowed: false; reason: BudgetDenyReason };

// Hard USD-budget gate. Decides whether one more request may spend money, given
// the current global/chat/new-user spend. Checked independently of — and before
// — the token rate limiter: money vs. fairness. Disabled and owner-exempt states
// short-circuit to `allowed` before any storage read, so calling it is cheap
// when off. The caller passes the resolved `BudgetConfig` (mirrors
// `RateLimiter.check(userId, config, now)`), keeping this a pure Storage adapter.
export interface BudgetGuard {
  check(
    args: { userId: string; chatId: string; isOwner: boolean; now: number },
    config: BudgetConfig,
  ): Promise<BudgetCheckResult>;
}
