// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { MemoryStorage } from "../storage/memory";
import { DualWindowLimiter } from "../ratelimit/dual-window";
import { currentWindowStarts } from "../ratelimit/window";
import { recordSpend } from "../spending/record";
import { DEFAULT_SETTINGS, type Settings } from "../shared/types";
import { SpendBudgetGuard } from "./guard";
import { checkTurnGates } from "./gate";

// Mid-month (2023-11-14 UTC), so "this month" and "last month" are distinct.
const NOW = 1_700_000_000_000;
const MS_PER_DAY = 86_400_000;

// Base limit 1000 tokens; class 1 raises it to 2000 with a $1 allowance.
const SETTINGS: Settings = {
  ...DEFAULT_SETTINGS,
  rateLimit: {
    ...DEFAULT_SETTINGS.rateLimit,
    fiveHourUsd: 1000,
    weeklyUsd: 10_000,
  },
  budget: {
    ...DEFAULT_SETTINGS.budget,
    globalMonthlyCapUsd: 100,
    globalDailyCapUsd: 10,
    perChatDailyCapUsd: 5,
    newUserWindowDays: 1,
  },
  limitClasses: {
    ...DEFAULT_SETTINGS.limitClasses,
    1: { limitMultiplier: 2, maxReminders: 5, monthlyAllowanceUsd: 1 },
  },
};

function setup() {
  const storage = new MemoryStorage();
  const gate = () =>
    checkTurnGates({
      storage,
      budgetGuard: new SpendBudgetGuard(storage),
      rateLimiter: new DualWindowLimiter(storage),
      settings: SETTINGS,
      userId: "u1",
      chatId: "c1",
      isOwner: false,
      now: NOW,
    });
  const useTokens = async (tokens: number) => {
    const s = currentWindowStarts("u1", NOW);
    await storage.usage.add("u1", tokens, s.fiveHour, s.weekly);
  };
  const spend = (costUsd: number, fromAllowance = false, now = NOW) =>
    recordSpend(
      storage,
      {
        userId: "u1",
        chatId: "c1",
        modelId: null,
        costUsd,
        priced: true,
        fromAllowance,
      },
      now,
    );
  return { storage, gate, useTokens, spend };
}

describe("checkTurnGates", () => {
  test("a regular request is not drawn from an allowance", async () => {
    const { storage, gate } = setup();
    await storage.limitClasses.set("u1", 1);
    expect(await gate()).toEqual({ kind: "allowed", fromAllowance: false });
  });

  test("a user without a class is held to the base limit", async () => {
    const { gate, useTokens } = setup();
    await useTokens(1000);
    expect((await gate()).kind).toBe("rateLimited");
  });

  test("past the base limit, a class user is drawn from the allowance", async () => {
    const { storage, gate, useTokens } = setup();
    await storage.limitClasses.set("u1", 1);
    await useTokens(1000);
    expect(await gate()).toEqual({ kind: "allowed", fromAllowance: true });
  });

  test("the class's raised limit is the ceiling", async () => {
    const { storage, gate, useTokens } = setup();
    await storage.limitClasses.set("u1", 1);
    await useTokens(2000);
    expect((await gate()).kind).toBe("rateLimited");
  });

  test("past a daily cap, a class user is drawn from the allowance", async () => {
    const { storage, gate, spend } = setup();
    await spend(5);
    expect(await gate()).toEqual({
      kind: "budgetLimited",
      reason: "chatDaily",
    });
    await storage.limitClasses.set("u1", 1);
    expect(await gate()).toEqual({ kind: "allowed", fromAllowance: true });
  });

  test("an exhausted allowance gives back the regular denial", async () => {
    const { storage, gate, useTokens, spend } = setup();
    await storage.limitClasses.set("u1", 1);
    await useTokens(1000);
    await spend(1, true);
    expect(await gate()).toMatchObject({
      kind: "rateLimited",
      limitedBy: "fiveHour",
    });
  });

  test("the allowance renews with the UTC calendar month", async () => {
    const { storage, gate, useTokens, spend } = setup();
    await storage.limitClasses.set("u1", 1);
    await useTokens(1000);
    await spend(1, true, NOW - 20 * MS_PER_DAY);
    expect(await gate()).toEqual({ kind: "allowed", fromAllowance: true });
  });

  test("no allowance gets past the global monthly cap", async () => {
    const { storage, gate } = setup();
    await storage.limitClasses.set("u1", 1);
    await storage.spend.addGlobal(100, NOW - 3 * MS_PER_DAY);
    expect(await gate()).toEqual({
      kind: "budgetLimited",
      reason: "globalMonthly",
    });
  });
});
