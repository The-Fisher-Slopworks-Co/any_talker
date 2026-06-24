// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { RateLimitConfig, WindowKind } from "../shared/types";

export type CheckResult =
  | { allowed: true }
  // Denied: the binding window and how long until it resets (and thus the
  // request would be allowed again). When both windows are exhausted this is
  // the weekly one, since its reset is later.
  | { allowed: false; limitedBy: WindowKind; msUntilReset: number };

export interface RateLimiter {
  check(
    userId: string,
    config: RateLimitConfig,
    now: number,
  ): Promise<CheckResult>;
  // Accrues spent tokens to both windows. Called after the AI responds, so it
  // can overshoot a window's budget (at-least-one-more-request semantics).
  deduct(userId: string, tokens: number, now: number): Promise<void>;
  // Clears a user's usage (admin reset): both windows drop to 0.
  reset(userId: string): Promise<void>;
}
