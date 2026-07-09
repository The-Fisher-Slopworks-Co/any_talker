// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { MemoryStorage } from "../storage/memory";
import { SpendBudgetGuard } from "./guard";
import { DEFAULT_SETTINGS, type BudgetConfig, type User } from "../shared/types";

const NOW = 1_700_000_000_000;
const MS_PER_DAY = 86_400_000;

const cfg = (over: Partial<BudgetConfig> = {}): BudgetConfig => ({
  ...DEFAULT_SETTINGS.budget,
  ...over,
});

const seenUser = (id: string, firstSeenAt: number): User => ({
  id,
  firstName: "T",
  lastName: null,
  username: null,
  firstSeenAt,
  lastSeenAt: firstSeenAt,
});

const args = (over: Partial<Parameters<SpendBudgetGuard["check"]>[0]> = {}) => ({
  userId: "u1",
  chatId: "c1",
  isOwner: false,
  now: NOW,
  ...over,
});

describe("SpendBudgetGuard", () => {
  test("allows when nothing has been spent", async () => {
    const guard = new SpendBudgetGuard(new MemoryStorage());
    expect(await guard.check(args(), cfg())).toEqual({ allowed: true });
  });

  test("disabled config always allows, even over every cap", async () => {
    const storage = new MemoryStorage();
    await storage.addGlobalSpend(1000, NOW);
    await storage.addChatSpend("c1", 1000, NOW);
    const guard = new SpendBudgetGuard(storage);
    expect(await guard.check(args(), cfg({ enabled: false }))).toEqual({
      allowed: true,
    });
  });

  test("owner is exempt when ownerExempt, despite a breached cap", async () => {
    const storage = new MemoryStorage();
    await storage.addGlobalSpend(1000, NOW);
    const guard = new SpendBudgetGuard(storage);
    expect(
      await guard.check(args({ isOwner: true }), cfg({ ownerExempt: true })),
    ).toEqual({ allowed: true });
  });

  test("owner is NOT exempt when ownerExempt is false", async () => {
    const storage = new MemoryStorage();
    await storage.addGlobalSpend(1000, NOW);
    const guard = new SpendBudgetGuard(storage);
    expect(
      await guard.check(args({ isOwner: true }), cfg({ ownerExempt: false })),
    ).toEqual({ allowed: false, reason: "globalMonthly" });
  });

  test("global monthly cap: spend on a past day this month denies today", async () => {
    const storage = new MemoryStorage();
    // 10 days ago — inside the 30-day month window but outside today/week.
    await storage.addGlobalSpend(20, NOW - 10 * MS_PER_DAY);
    const guard = new SpendBudgetGuard(storage);
    const r = await guard.check(args(), cfg({ globalMonthlyCapUsd: 18 }));
    expect(r).toEqual({ allowed: false, reason: "globalMonthly" });
  });

  test("global daily cap denies when today's global spend is over", async () => {
    const storage = new MemoryStorage();
    await storage.addGlobalSpend(3, NOW);
    const guard = new SpendBudgetGuard(storage);
    // Month (3) is under 18, so the daily cap (2) is the binding one.
    const r = await guard.check(
      args(),
      cfg({ globalMonthlyCapUsd: 18, globalDailyCapUsd: 2 }),
    );
    expect(r).toEqual({ allowed: false, reason: "globalDaily" });
  });

  test("per-chat daily cap denies an over-spending chat", async () => {
    const storage = new MemoryStorage();
    await storage.addChatSpend("c1", 2, NOW);
    const guard = new SpendBudgetGuard(storage);
    const r = await guard.check(args(), cfg({ perChatDailyCapUsd: 1 }));
    expect(r).toEqual({ allowed: false, reason: "chatDaily" });
  });

  test("per-chat cap is scoped to the chat that overspent", async () => {
    const storage = new MemoryStorage();
    await storage.addChatSpend("c1", 5, NOW);
    const guard = new SpendBudgetGuard(storage);
    const r = await guard.check(
      args({ chatId: "c2" }),
      cfg({ perChatDailyCapUsd: 1 }),
    );
    expect(r).toEqual({ allowed: true });
  });

  test("new-user cap denies a freshly-seen user over the soft-start limit", async () => {
    const storage = new MemoryStorage();
    await storage.upsertUser(seenUser("u1", NOW)); // seen today ⇒ new
    await storage.addUserSpend("u1", 0.2, NOW);
    const guard = new SpendBudgetGuard(storage);
    const r = await guard.check(
      args(),
      cfg({ newUserWindowDays: 3, newUserDailyCapUsd: 0.1 }),
    );
    expect(r).toEqual({ allowed: false, reason: "newUser" });
  });

  test("new-user cap does not apply once outside the window", async () => {
    const storage = new MemoryStorage();
    await storage.upsertUser(seenUser("u1", NOW - 4 * MS_PER_DAY));
    await storage.addUserSpend("u1", 0.2, NOW);
    const guard = new SpendBudgetGuard(storage);
    const r = await guard.check(
      args(),
      cfg({ newUserWindowDays: 3, newUserDailyCapUsd: 0.1 }),
    );
    expect(r).toEqual({ allowed: true });
  });

  test("new-user cap is skipped when the user has no record yet", async () => {
    const storage = new MemoryStorage();
    await storage.addUserSpend("u1", 5, NOW); // spend but no directory row
    const guard = new SpendBudgetGuard(storage);
    const r = await guard.check(args(), cfg({ newUserDailyCapUsd: 0.1 }));
    expect(r).toEqual({ allowed: true });
  });

  test("a brand-new user's first request is allowed (zero spend so far)", async () => {
    const storage = new MemoryStorage();
    await storage.upsertUser(seenUser("u1", NOW));
    const guard = new SpendBudgetGuard(storage);
    const r = await guard.check(
      args(),
      cfg({ newUserWindowDays: 3, newUserDailyCapUsd: 0.1 }),
    );
    expect(r).toEqual({ allowed: true });
  });

  test("precedence: monthly outranks daily outranks chat", async () => {
    const storage = new MemoryStorage();
    await storage.addGlobalSpend(50, NOW); // trips both monthly and daily
    await storage.addChatSpend("c1", 50, NOW); // trips chat too
    const guard = new SpendBudgetGuard(storage);
    const r = await guard.check(args(), cfg());
    expect(r).toEqual({ allowed: false, reason: "globalMonthly" });
  });
});
