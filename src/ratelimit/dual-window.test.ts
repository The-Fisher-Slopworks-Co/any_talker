// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { MemoryStorage } from "../storage/memory";
import { DualWindowLimiter } from "./dual-window";
import {
  FIVE_HOUR_MS,
  WEEK_MS,
  windowStart,
  currentWindowStarts,
} from "./window";
import type { RateLimitConfig } from "../shared/types";

const cfg: RateLimitConfig = {
  fiveHourTokens: 100,
  weeklyTokens: 1000,
  ownerExempt: true,
  wiseMultiplier: 1.8,
};

const NOW = 1_700_000_000_000;
const U = "u1";

describe("DualWindowLimiter", () => {
  test("a fresh user is allowed", async () => {
    const lim = new DualWindowLimiter(new MemoryStorage());
    const r = await lim.check(U, cfg, NOW);
    expect(r.allowed).toBe(true);
  });

  test("denies (fiveHour) when the 5-hour budget is spent", async () => {
    const storage = new MemoryStorage();
    const lim = new DualWindowLimiter(storage);
    const s = currentWindowStarts(U, NOW);
    await storage.addUserUsage(U, cfg.fiveHourTokens, s.fiveHour, s.weekly);
    const r = await lim.check(U, cfg, NOW);
    expect(r.allowed).toBe(false);
    if (!r.allowed) {
      expect(r.limitedBy).toBe("fiveHour");
      expect(r.msUntilReset).toBeGreaterThan(0);
      expect(r.msUntilReset).toBeLessThanOrEqual(FIVE_HOUR_MS);
    }
  });

  test("denies (weekly) when only the weekly budget is spent", async () => {
    const storage = new MemoryStorage();
    const lim = new DualWindowLimiter(storage);
    const s = currentWindowStarts(U, NOW);
    // Weekly budget spent, but against a *previous* 5-hour window — so the
    // current 5-hour window still has room and the weekly cap is what binds.
    await storage.addUserUsage(
      U,
      cfg.weeklyTokens,
      s.fiveHour - FIVE_HOUR_MS,
      s.weekly,
    );
    const r = await lim.check(U, cfg, NOW);
    expect(r.allowed).toBe(false);
    if (!r.allowed) {
      expect(r.limitedBy).toBe("weekly");
      expect(r.msUntilReset).toBeLessThanOrEqual(WEEK_MS);
    }
  });

  test("both exhausted: reports the window that resets LAST — here the weekly", async () => {
    const storage = new MemoryStorage();
    const lim = new DualWindowLimiter(storage);
    // For user U at NOW, the weekly window resets after the 5-hour one.
    const fiveReset = windowStart(U, FIVE_HOUR_MS, NOW) + FIVE_HOUR_MS;
    const weekReset = windowStart(U, WEEK_MS, NOW) + WEEK_MS;
    expect(weekReset).toBeGreaterThan(fiveReset);
    const s = currentWindowStarts(U, NOW);
    await storage.addUserUsage(U, cfg.weeklyTokens, s.fiveHour, s.weekly);
    const r = await lim.check(U, cfg, NOW);
    expect(r.allowed).toBe(false);
    if (!r.allowed) {
      expect(r.limitedBy).toBe("weekly");
      expect(r.msUntilReset).toBe(weekReset - NOW);
    }
  });

  test("both exhausted: reports the 5-hour window when ITS reset is later (independent phases)", async () => {
    const storage = new MemoryStorage();
    const lim = new DualWindowLimiter(storage);
    // The two windows are phase-shifted independently, so for some users the
    // 5-hour window resets AFTER the weekly one. This (user, time) is such a case.
    const id = "1";
    const now = 1_700_049_320_000;
    const fiveReset = windowStart(id, FIVE_HOUR_MS, now) + FIVE_HOUR_MS;
    const weekReset = windowStart(id, WEEK_MS, now) + WEEK_MS;
    expect(fiveReset).toBeGreaterThan(weekReset); // precondition for this case
    const s = currentWindowStarts(id, now);
    await storage.addUserUsage(id, cfg.weeklyTokens, s.fiveHour, s.weekly);
    const r = await lim.check(id, cfg, now);
    expect(r.allowed).toBe(false);
    if (!r.allowed) {
      // Must report the 5-hour reset (the later one) — not the weekly.
      expect(r.limitedBy).toBe("fiveHour");
      expect(r.msUntilReset).toBe(fiveReset - now);
    }
  });

  test("deduct accrues to both windows", async () => {
    const storage = new MemoryStorage();
    const lim = new DualWindowLimiter(storage);
    await lim.deduct(U, 30, NOW);
    await lim.deduct(U, 20, NOW);
    const u = await storage.getUserUsage(U);
    expect(u?.fiveHour.used).toBe(50);
    expect(u?.weekly.used).toBe(50);
  });

  test("deduct rolls the 5-hour window over while the weekly keeps accruing", async () => {
    const storage = new MemoryStorage();
    const lim = new DualWindowLimiter(storage);
    await lim.deduct(U, 40, NOW);
    // One 5-hour window later: the 5-hour used restarts, weekly accumulates.
    const later = NOW + FIVE_HOUR_MS;
    await lim.deduct(U, 10, later);
    const u = await storage.getUserUsage(U);
    expect(u?.fiveHour.used).toBe(10);
    expect(u?.weekly.used).toBe(50);
  });

  test("deduct can overshoot a window's budget (request already in flight)", async () => {
    const storage = new MemoryStorage();
    const lim = new DualWindowLimiter(storage);
    await lim.deduct(U, cfg.fiveHourTokens + 500, NOW);
    const r = await lim.check(U, cfg, NOW);
    expect(r.allowed).toBe(false);
  });

  test("reset clears the user's usage", async () => {
    const storage = new MemoryStorage();
    const lim = new DualWindowLimiter(storage);
    await lim.deduct(U, 50, NOW);
    await lim.reset(U);
    expect(await storage.getUserUsage(U)).toBeNull();
    expect((await lim.check(U, cfg, NOW)).allowed).toBe(true);
  });

  test("concurrent deducts sum correctly (atomic accrual)", async () => {
    const storage = new MemoryStorage();
    const lim = new DualWindowLimiter(storage);
    await Promise.all([
      lim.deduct(U, 10, NOW),
      lim.deduct(U, 10, NOW),
      lim.deduct(U, 10, NOW),
    ]);
    expect((await storage.getUserUsage(U))?.fiveHour.used).toBe(30);
  });
});
