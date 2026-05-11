// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { Storage } from "../storage/types";
import type { RateLimiter, CheckResult } from "./types";
import type { RateLimitConfig, BucketState } from "../shared/types";

export class TokenBucketLimiter implements RateLimiter {
  constructor(private readonly storage: Storage) {}

  private async loadOrSeed(
    chatId: string,
    userId: string,
    config: RateLimitConfig,
    now: number,
  ): Promise<BucketState> {
    const existing = await this.storage.getBucket(chatId, userId);
    if (existing) return existing;
    const seeded: BucketState = { tokens: config.capacity, lastRefillTs: now };
    await this.storage.saveBucket(chatId, userId, seeded);
    return seeded;
  }

  private refill(state: BucketState, config: RateLimitConfig, now: number): BucketState {
    const elapsed = now - state.lastRefillTs;
    if (elapsed < config.refillIntervalMs) return state;
    const periods = Math.floor(elapsed / config.refillIntervalMs);
    const newTokens = Math.min(config.capacity, state.tokens + periods * config.refillAmount);
    return {
      tokens: newTokens,
      lastRefillTs: state.lastRefillTs + periods * config.refillIntervalMs,
    };
  }

  async check(
    chatId: string,
    userId: string,
    config: RateLimitConfig,
    now: number,
  ): Promise<CheckResult> {
    const seeded = await this.loadOrSeed(chatId, userId, config, now);
    const refilled = this.refill(seeded, config, now);
    if (refilled !== seeded) {
      await this.storage.saveBucket(chatId, userId, refilled);
    }
    if (refilled.tokens <= 0) {
      const elapsed = now - refilled.lastRefillTs;
      const msUntilNextRefill = config.refillIntervalMs - elapsed;
      return { allowed: false, bucket: refilled, msUntilNextRefill };
    }
    return { allowed: true, bucket: refilled };
  }

  async deduct(chatId: string, userId: string, tokens: number): Promise<void> {
    const current = await this.storage.getBucket(chatId, userId);
    if (!current) {
      await this.storage.saveBucket(chatId, userId, {
        tokens: -tokens,
        lastRefillTs: Date.now(),
      });
      return;
    }
    await this.storage.saveBucket(chatId, userId, {
      tokens: current.tokens - tokens,
      lastRefillTs: current.lastRefillTs,
    });
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
