// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { DEFAULT_SETTINGS, type Settings } from "../shared/types";
import { MemoryStorage } from "../storage/memory";
import { userRateLimit, userReminderCap } from "./limit-class";

const NOW = 1_700_000_000_000;
const SETTINGS: Settings = {
  ...DEFAULT_SETTINGS,
  rateLimit: {
    ...DEFAULT_SETTINGS.rateLimit,
    fiveHourTokens: 1000,
    weeklyTokens: 10_001,
  },
  limitClasses: {
    1: { tokenMultiplier: 2, maxReminders: 15 },
    2: { tokenMultiplier: 2.5, maxReminders: 3 },
  },
  maxRemindersPerUser: 5,
};

describe("userRateLimit", () => {
  test("is the base config for a user without a class", () => {
    expect(userRateLimit(SETTINGS, null, NOW)).toBe(SETTINGS.rateLimit);
  });

  test("multiplies both budgets by the class multiplier", () => {
    const r = userRateLimit(SETTINGS, 2, NOW);
    expect(r).toEqual({
      ...SETTINGS.rateLimit,
      fiveHourTokens: 2500,
      weeklyTokens: 25_002,
    });
  });

  test("applies a running promo on top of the class", () => {
    const settings = {
      ...SETTINGS,
      limitBoost: { percent: 50, untilMs: NOW + 1 },
    };
    const r = userRateLimit(settings, 1, NOW);
    expect(r.fiveHourTokens).toBe(3000);
    expect(r.weeklyTokens).toBe(30_003);
  });
});

describe("userReminderCap", () => {
  test("is the global cap for a user without a class", () => {
    expect(userReminderCap(SETTINGS, null)).toBe(5);
  });

  test("is the class cap when it is higher", () => {
    expect(userReminderCap(SETTINGS, 1)).toBe(15);
  });

  test("never drops below the global cap", () => {
    expect(userReminderCap(SETTINGS, 2)).toBe(5);
  });
});

describe("MemoryStorage.limitClasses", () => {
  test("sets, replaces, lists and removes a user's class", async () => {
    const storage = new MemoryStorage();
    expect(await storage.limitClasses.get("u1")).toBeNull();

    await storage.limitClasses.set("u1", 1);
    await storage.limitClasses.set("u2", 2);
    await storage.limitClasses.set("u1", 2);
    expect(await storage.limitClasses.get("u1")).toBe(2);
    expect(await storage.forBot("bot").limitClasses.list()).toEqual([
      { userId: "u1", limitClass: 2 },
      { userId: "u2", limitClass: 2 },
    ]);

    await storage.limitClasses.remove("u1");
    expect(await storage.limitClasses.get("u1")).toBeNull();
    expect(await storage.limitClasses.list()).toEqual([
      { userId: "u2", limitClass: 2 },
    ]);
  });
});
