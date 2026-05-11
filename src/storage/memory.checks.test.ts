// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { MemoryStorage } from "./memory";
import type { RecurringCheck } from "../checks/types";

function makeCheck(over: Partial<RecurringCheck> = {}): RecurringCheck {
  return {
    id: "c1",
    title: "Sport",
    chatId: "chat-1",
    targetUserId: "user-1",
    targetName: "Nikita",
    scheduleHour: 23,
    scheduleMinute: 30,
    timezone: "UTC",
    question: "q",
    yesButton: "Y",
    noButton: "N",
    yesReply: "yes",
    noReply: "no",
    timeoutMinutes: 25,
    counter: 0,
    counterMode: "always_increment",
    enabled: true,
    lastFiredAtMs: 0,
    pendingMessageId: null,
    pendingFiredAtMs: null,
    createdAtMs: 100,
    ...over,
  };
}

describe("MemoryStorage checks", () => {
  test("save then get round-trips", async () => {
    const s = new MemoryStorage();
    await s.saveCheck(makeCheck());
    expect(await s.getCheck("c1")).toEqual(makeCheck());
  });

  test("save returns deep-cloned values (no aliasing)", async () => {
    const s = new MemoryStorage();
    const c = makeCheck();
    await s.saveCheck(c);
    c.counter = 999;
    const got = await s.getCheck("c1");
    expect(got?.counter).toBe(0);
  });

  test("listChecks returns all, sorted by createdAtMs asc", async () => {
    const s = new MemoryStorage();
    await s.saveCheck(makeCheck({ id: "late", createdAtMs: 200 }));
    await s.saveCheck(makeCheck({ id: "early", createdAtMs: 100 }));
    const list = await s.listChecks();
    expect(list.map((c) => c.id)).toEqual(["early", "late"]);
  });

  test("listChecks returns empty initially", async () => {
    const s = new MemoryStorage();
    expect(await s.listChecks()).toEqual([]);
  });

  test("deleteCheck removes it", async () => {
    const s = new MemoryStorage();
    await s.saveCheck(makeCheck());
    await s.deleteCheck("c1");
    expect(await s.getCheck("c1")).toBeNull();
    expect(await s.listChecks()).toEqual([]);
  });

  test("getCheck returns null for unknown id", async () => {
    const s = new MemoryStorage();
    expect(await s.getCheck("nope")).toBeNull();
  });
});
