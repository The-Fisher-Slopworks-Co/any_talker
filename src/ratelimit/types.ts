// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { RateLimitConfig, BucketState } from "../shared/types";

export type CheckResult =
  | { allowed: true; bucket: BucketState }
  | { allowed: false; bucket: BucketState; msUntilNextRefill: number };

export interface RateLimiter {
  check(
    chatId: string,
    userId: string,
    config: RateLimitConfig,
    now: number,
  ): Promise<CheckResult>;
  deduct(chatId: string, userId: string, tokens: number): Promise<void>;
  reset(
    chatId: string,
    userId: string,
    config: RateLimitConfig,
    now: number,
  ): Promise<void>;
}
