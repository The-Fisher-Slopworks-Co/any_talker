// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { Storage } from "../storage/types";
import type { RateLimiter, CheckResult } from "./types";
import type { RateLimitConfig } from "../shared/types";
import { summarizeUsage, currentWindowStarts } from "./window";
import {
  rateLimitChecksTotal,
  rateLimitTokensDeductedTotal,
} from "../metrics";

// Per-user dual fixed-window limiter (5-hour + weekly). `check` is read-only —
// the window math is deterministic, so the only persisted state is the spent
// total, written by `deduct` after the AI responds. All windowing lives in the
// pure `./window` module; this class is the thin Storage/metrics adapter.
export class DualWindowLimiter implements RateLimiter {
  constructor(private readonly storage: Storage) {}

  async check(
    userId: string,
    config: RateLimitConfig,
    now: number,
  ): Promise<CheckResult> {
    const stored = await this.storage.getUserUsage(userId);
    const status = summarizeUsage(userId, config, stored, now);
    const weeklyExhausted = status.weekly.remaining <= 0;
    const fiveExhausted = status.fiveHour.remaining <= 0;
    if (weeklyExhausted || fiveExhausted) {
      rateLimitChecksTotal.inc({ result: "denied" });
      // The request is allowed again only once EVERY exhausted window has rolled
      // over, so the binding constraint is the exhausted window that resets
      // LAST. The two windows are phase-shifted by independent per-user offsets,
      // so the weekly reset is NOT always the later one — when both are
      // exhausted, compare their reset times rather than assuming.
      const fiveBinds =
        fiveExhausted &&
        (!weeklyExhausted || status.fiveHour.resetMs >= status.weekly.resetMs);
      const binding = fiveBinds ? status.fiveHour : status.weekly;
      return {
        allowed: false,
        limitedBy: fiveBinds ? "fiveHour" : "weekly",
        msUntilReset: binding.resetMs - now,
      };
    }
    rateLimitChecksTotal.inc({ result: "allowed" });
    return { allowed: true };
  }

  async deduct(userId: string, tokens: number, now: number): Promise<void> {
    if (tokens > 0) rateLimitTokensDeductedTotal.inc(tokens);
    const starts = currentWindowStarts(userId, now);
    await this.storage.addUserUsage(
      userId,
      tokens,
      starts.fiveHour,
      starts.weekly,
    );
  }

  async reset(userId: string): Promise<void> {
    await this.storage.resetUserUsage(userId);
  }
}
