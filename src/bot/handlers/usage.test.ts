// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { MemoryStorage } from "../../storage/memory";
import { DEFAULT_SETTINGS } from "../../shared/types";
import { currentWindowStarts } from "../../ratelimit/window";
import { matchUsageCommand, usageCommandHandler } from "./usage";

const NOW = 1_700_000_000_000;
const USER = "u1";

const run = (
  storage: MemoryStorage,
  over: Partial<Parameters<typeof usageCommandHandler>[0]> = {},
) =>
  usageCommandHandler({
    storage,
    ownerId: "owner",
    isPrivateChat: true,
    fromUserId: USER,
    lang: "en",
    nowMs: NOW,
    ...over,
  });

// Accrues `tokens` into both of the user's current windows.
async function spend(storage: MemoryStorage, userId: string, tokens: number) {
  const starts = currentWindowStarts(userId, NOW);
  await storage.addUserUsage(userId, tokens, starts.fiveHour, starts.weekly);
}

async function withLimits(five: number, weekly: number) {
  const storage = new MemoryStorage();
  await storage.saveSettings({
    ...DEFAULT_SETTINGS,
    rateLimit: {
      ...DEFAULT_SETTINGS.rateLimit,
      fiveHourTokens: five,
      weeklyTokens: weekly,
    },
  });
  return storage;
}

describe("matchUsageCommand", () => {
  test("matches the bare command and this bot's mention", () => {
    expect(matchUsageCommand("/usage", "mybot")).toBe(true);
    expect(matchUsageCommand("  /usage  ", "mybot")).toBe(true);
    expect(matchUsageCommand("/USAGE", "mybot")).toBe(true);
    expect(matchUsageCommand("/usage@mybot", "mybot")).toBe(true);
  });

  test("ignores another bot's command and anything with arguments", () => {
    expect(matchUsageCommand("/usage@otherbot", "mybot")).toBe(false);
    expect(matchUsageCommand("/usage please", "mybot")).toBe(false);
    expect(matchUsageCommand("/usages", "mybot")).toBe(false);
    expect(matchUsageCommand("show me /usage", "mybot")).toBe(false);
  });
});

describe("usageCommandHandler", () => {
  test("ignores group chats", async () => {
    const storage = new MemoryStorage();
    expect(await run(storage, { isPrivateChat: false })).toEqual({
      kind: "ignored",
    });
  });

  test("reports 0% for a user who has never spent anything", async () => {
    const storage = await withLimits(1000, 10_000);
    const outcome = await run(storage);
    expect(outcome.kind).toBe("usage");
    if (outcome.kind !== "usage") throw new Error("unreachable");
    expect(outcome.text).toContain("5 hours\n0%");
    expect(outcome.text).toContain("Week\n0%");
    expect(outcome.text).toContain("until reset");
  });

  test("is a header plus a line each for window, share and reset", async () => {
    const storage = await withLimits(1000, 10_000);
    await spend(storage, USER, 250);
    const outcome = await run(storage);
    if (outcome.kind !== "usage") throw new Error("expected a report");
    const lines = outcome.text.split("\n");
    expect(lines).toHaveLength(9);
    expect(lines[0]).toBe("📊 Limit used");
    expect(lines[1]).toBe("");
    expect(lines[2]).toBe("5 hours");
    expect(lines[3]).toBe("25%");
    expect(lines[4]).toMatch(/^~\d+ [a-z]+ until reset$/);
    expect(lines[5]).toBe("");
    expect(lines[6]).toBe("Week");
    expect(lines[7]).toBe("3%");
    expect(lines[8]).toMatch(/^~\d+ [a-z]+ until reset$/);
  });

  // The bare "25%" only reads as "spent" because the header says so.
  test("says what the percentage is a share of, once, in the header", async () => {
    const storage = await withLimits(1000, 10_000);
    const outcome = await run(storage);
    if (outcome.kind !== "usage") throw new Error("expected a report");
    expect(outcome.text.match(/used/g)).toHaveLength(1);
  });

  test("never leaks a token count", async () => {
    const storage = await withLimits(1000, 10_000);
    await spend(storage, USER, 250);
    const outcome = await run(storage);
    if (outcome.kind !== "usage") throw new Error("expected a report");
    expect(outcome.text).not.toContain("250");
    expect(outcome.text).not.toContain("1000");
    expect(outcome.text).not.toContain("1,000");
    expect(outcome.text).not.toContain("10000");
    expect(outcome.text).not.toContain("10,000");
  });

  test("names how long each window has left", async () => {
    const storage = await withLimits(1000, 10_000);
    const outcome = await run(storage);
    if (outcome.kind !== "usage") throw new Error("expected a report");
    expect(outcome.text.match(/until reset/g)).toHaveLength(2);
  });

  test("answers in Russian for a Russian-speaking user", async () => {
    const storage = await withLimits(1000, 10_000);
    await spend(storage, USER, 250);
    const outcome = await run(storage, { lang: "ru" });
    if (outcome.kind !== "usage") throw new Error("expected a report");
    expect(outcome.text).toContain("📊 Израсходовано лимита");
    expect(outcome.text).toMatch(/5 часов\n25%\n~\d+ \S+ до сброса/);
    expect(outcome.text).toMatch(/Неделя\n3%\n~\d+ \S+ до сброса/);
    expect(outcome.text.match(/Израсходовано/g)).toHaveLength(1);
  });

  test("tells an exempt owner they have no limits", async () => {
    const storage = await withLimits(1000, 10_000);
    const outcome = await run(storage, { fromUserId: "owner" });
    if (outcome.kind !== "usage") throw new Error("expected a report");
    expect(outcome.text).toContain("don't apply to you");
    expect(outcome.text).not.toContain("%");
  });

  test("reports real percentages for the owner when exemption is off", async () => {
    const storage = new MemoryStorage();
    await storage.saveSettings({
      ...DEFAULT_SETTINGS,
      rateLimit: {
        ...DEFAULT_SETTINGS.rateLimit,
        fiveHourTokens: 1000,
        weeklyTokens: 10_000,
        ownerExempt: false,
      },
    });
    await spend(storage, "owner", 500);
    const outcome = await run(storage, { fromUserId: "owner" });
    if (outcome.kind !== "usage") throw new Error("expected a report");
    expect(outcome.text).toContain("5 hours\n50%");
  });

  test("does not accrue usage — asking is free", async () => {
    const storage = await withLimits(1000, 10_000);
    await spend(storage, USER, 250);
    const before = await storage.getUserUsage(USER);
    await run(storage);
    expect(await storage.getUserUsage(USER)).toEqual(before);
  });
});
