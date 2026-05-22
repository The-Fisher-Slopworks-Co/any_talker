// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { Storage } from "../storage/types";
import type { RateLimiter, CheckResult } from "./types";
import type { RateLimitConfig } from "../shared/types";
import {
  rateLimitChecksTotal,
  rateLimitTokensDeductedTotal,
} from "../metrics";

export class TokenBucketLimiter implements RateLimiter {
  constructor(private readonly storage: Storage) {}

  async check(
    chatId: string,
    userId: string,
    config: RateLimitConfig,
    now: number,
  ): Promise<CheckResult> {
    const bucket = await this.storage.refillBucket(chatId, userId, config, now);
    if (bucket.tokens <= 0) {
      const elapsed = now - bucket.lastRefillTs;
      const msUntilNextRefill = config.refillIntervalMs - elapsed;
      rateLimitChecksTotal.inc({ result: "denied" });
      return { allowed: false, bucket, msUntilNextRefill };
    }
    rateLimitChecksTotal.inc({ result: "allowed" });
    return { allowed: true, bucket };
  }

  async deduct(chatId: string, userId: string, tokens: number): Promise<void> {
    if (tokens > 0) rateLimitTokensDeductedTotal.inc(tokens);
    await this.storage.deductBucket(chatId, userId, tokens, Date.now());
  }

  async reset(
    chatId: string,
    userId: string,
    config: RateLimitConfig,
    now: number,
  ): Promise<void> {
    await this.storage.saveBucket(chatId, userId, {
      tokens: config.capacity,
      lastRefillTs: now,
    });
  }
}
