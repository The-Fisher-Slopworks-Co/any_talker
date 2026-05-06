import type { Storage } from "../storage/types";
import type { RateLimiter, CheckResult } from "./types";
import type { RateLimitConfig, BucketState } from "../shared/types";

export class TokenBucketLimiter implements RateLimiter {
  constructor(private readonly storage: Storage) {}

  private async loadOrSeed(
    userId: string,
    config: RateLimitConfig,
    now: number,
  ): Promise<BucketState> {
    const existing = await this.storage.getBucket(userId);
    if (existing) return existing;
    const seeded: BucketState = { tokens: config.capacity, lastRefillTs: now };
    await this.storage.saveBucket(userId, seeded);
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
    userId: string,
    config: RateLimitConfig,
    now: number,
  ): Promise<CheckResult> {
    const seeded = await this.loadOrSeed(userId, config, now);
    const refilled = this.refill(seeded, config, now);
    if (refilled !== seeded) {
      await this.storage.saveBucket(userId, refilled);
    }
    if (refilled.tokens <= 0) {
      const elapsed = now - refilled.lastRefillTs;
      const msUntilNextRefill = config.refillIntervalMs - elapsed;
      return { allowed: false, bucket: refilled, msUntilNextRefill };
    }
    return { allowed: true, bucket: refilled };
  }

  async deduct(userId: string, tokens: number): Promise<void> {
    const current = await this.storage.getBucket(userId);
    if (!current) return;
    await this.storage.saveBucket(userId, {
      tokens: current.tokens - tokens,
      lastRefillTs: current.lastRefillTs,
    });
  }

  async reset(userId: string, config: RateLimitConfig, now: number): Promise<void> {
    await this.storage.saveBucket(userId, {
      tokens: config.capacity,
      lastRefillTs: now,
    });
  }
}
