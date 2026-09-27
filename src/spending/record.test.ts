// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { MemoryStorage } from "../storage/memory";
import { recordSpend, type SpendRecord } from "./record";

// 2023-11-14 UTC: mid-month, so "this month" and "last month" are distinct.
const NOW = 1_700_000_000_000;
const MS_PER_DAY = 86_400_000;

const entry = (over: Partial<SpendRecord> = {}): SpendRecord => ({
  userId: "u1",
  chatId: "c1",
  modelId: "m",
  costUsd: 0.5,
  priced: true,
  ...over,
});

describe("recordSpend allowance", () => {
  test("a regular request never touches the allowance ledger", async () => {
    const storage = new MemoryStorage();
    await recordSpend(storage, entry(), NOW);
    expect(await storage.spend.getAllowanceMonth("u1", NOW)).toBe(0);
    expect(await storage.spend.getAllowanceDay("c1", NOW)).toEqual({
      global: 0,
      chat: 0,
    });
  });

  test("an allowance request is booked to both ledgers", async () => {
    const storage = new MemoryStorage();
    await recordSpend(storage, entry({ fromAllowance: true }), NOW);
    expect((await storage.spend.getUser("u1", NOW)).day).toBe(0.5);
    expect((await storage.spend.getGlobal(NOW)).day).toBe(0.5);
    expect(await storage.spend.getAllowanceMonth("u1", NOW)).toBe(0.5);
    expect(await storage.spend.getAllowanceDay("c1", NOW)).toEqual({
      global: 0.5,
      chat: 0.5,
    });
    expect(await storage.spend.getAllowanceDay("c2", NOW)).toEqual({
      global: 0.5,
      chat: 0,
    });
  });

  test("the month is the UTC calendar month", async () => {
    const storage = new MemoryStorage();
    const allowance = (now: number) =>
      recordSpend(storage, entry({ fromAllowance: true }), now);
    await allowance(NOW - 13 * MS_PER_DAY); // Nov 1
    await allowance(NOW - 14 * MS_PER_DAY); // Oct 31
    expect(await storage.spend.getAllowanceMonth("u1", NOW)).toBe(0.5);
  });
});
