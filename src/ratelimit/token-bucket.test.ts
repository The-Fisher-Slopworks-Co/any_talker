import { test, expect, describe } from "bun:test";
import { MemoryStorage } from "../storage/memory";
import { TokenBucketLimiter } from "./token-bucket";
import type { RateLimitConfig } from "../shared/types";

const cfg: RateLimitConfig = {
  capacity: 30000,
  refillAmount: 3000,
  refillIntervalMs: 40 * 60 * 1000,
  ownerExempt: true,
};

describe("TokenBucketLimiter", () => {
  test("first check seeds bucket at capacity", async () => {
    const lim = new TokenBucketLimiter(new MemoryStorage());
    const r = await lim.check("u1", cfg, 1000);
    expect(r.allowed).toBe(true);
    if (r.allowed) {
      expect(r.bucket.tokens).toBe(30000);
      expect(r.bucket.lastRefillTs).toBe(1000);
    }
  });

  test("deduct subtracts tokens and persists", async () => {
    const storage = new MemoryStorage();
    const lim = new TokenBucketLimiter(storage);
    await lim.check("u1", cfg, 1000);
    await lim.deduct("u1", 500);
    const b = await storage.getBucket("u1");
    expect(b?.tokens).toBe(29500);
  });

  test("denies when tokens <= 0", async () => {
    const storage = new MemoryStorage();
    const lim = new TokenBucketLimiter(storage);
    await storage.saveBucket("u1", { tokens: 0, lastRefillTs: 1000 });
    const r = await lim.check("u1", cfg, 1000);
    expect(r.allowed).toBe(false);
    if (!r.allowed) {
      expect(r.msUntilNextRefill).toBe(cfg.refillIntervalMs);
    }
  });

  test("refills lazily based on elapsed intervals", async () => {
    const storage = new MemoryStorage();
    const lim = new TokenBucketLimiter(storage);
    await storage.saveBucket("u1", { tokens: 0, lastRefillTs: 1000 });
    // 2 full intervals elapsed → +6000
    const r = await lim.check("u1", cfg, 1000 + 2 * cfg.refillIntervalMs);
    expect(r.allowed).toBe(true);
    if (r.allowed) {
      expect(r.bucket.tokens).toBe(6000);
      expect(r.bucket.lastRefillTs).toBe(1000 + 2 * cfg.refillIntervalMs);
    }
  });

  test("refill is capped at capacity", async () => {
    const storage = new MemoryStorage();
    const lim = new TokenBucketLimiter(storage);
    await storage.saveBucket("u1", { tokens: 29000, lastRefillTs: 1000 });
    const r = await lim.check("u1", cfg, 1000 + 100 * cfg.refillIntervalMs);
    expect(r.allowed).toBe(true);
    if (r.allowed) expect(r.bucket.tokens).toBe(cfg.capacity);
  });

  test("partial interval does not refill", async () => {
    const storage = new MemoryStorage();
    const lim = new TokenBucketLimiter(storage);
    await storage.saveBucket("u1", { tokens: 100, lastRefillTs: 1000 });
    const r = await lim.check("u1", cfg, 1000 + cfg.refillIntervalMs - 1);
    expect(r.allowed).toBe(true);
    if (r.allowed) {
      expect(r.bucket.tokens).toBe(100);
      expect(r.bucket.lastRefillTs).toBe(1000);
    }
  });

  test("reset puts bucket at full capacity", async () => {
    const storage = new MemoryStorage();
    const lim = new TokenBucketLimiter(storage);
    await storage.saveBucket("u1", { tokens: -500, lastRefillTs: 1 });
    await lim.reset("u1", cfg, 9999);
    const b = await storage.getBucket("u1");
    expect(b).toEqual({ tokens: cfg.capacity, lastRefillTs: 9999 });
  });

  test("deduct can drive bucket negative (request already in flight)", async () => {
    const storage = new MemoryStorage();
    const lim = new TokenBucketLimiter(storage);
    await storage.saveBucket("u1", { tokens: 100, lastRefillTs: 1 });
    await lim.deduct("u1", 1000);
    expect((await storage.getBucket("u1"))?.tokens).toBe(-900);
  });

  test("deduct seeds a deficit bucket if storage was empty", async () => {
    const storage = new MemoryStorage();
    const lim = new TokenBucketLimiter(storage);
    await lim.deduct("u1", 100);
    const b = await storage.getBucket("u1");
    expect(b).not.toBeNull();
    expect(b?.tokens).toBe(-100);
  });
});
