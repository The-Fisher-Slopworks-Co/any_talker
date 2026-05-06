import type { RateLimitConfig, BucketState } from "../shared/types";

export type CheckResult =
  | { allowed: true; bucket: BucketState }
  | { allowed: false; bucket: BucketState; msUntilNextRefill: number };

export interface RateLimiter {
  check(userId: string, config: RateLimitConfig, now: number): Promise<CheckResult>;
  deduct(userId: string, tokens: number): Promise<void>;
  reset(userId: string, config: RateLimitConfig, now: number): Promise<void>;
}
