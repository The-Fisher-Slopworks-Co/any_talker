// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect } from "bun:test";
import type { Api } from "grammy";
import { MemoryStorage } from "../storage/memory";
import { BotManager, type BotManagerDeps } from "./manager";
import type { RateLimiter } from "../ratelimit/types";
import type { BudgetGuard } from "../budget/types";
import type { AIClient } from "../ai/types";
import type { ManagedBot } from "./types";

// The manager only brokers tokens through the main bot's api here; the
// network-bound startBot path (getMe + bot.start) is exercised in live runs,
// not unit tests, matching the project's no-live-network test policy.
function makeManager(storage: MemoryStorage) {
  const tokenCalls: number[] = [];
  const mainApi = {
    getManagedBotToken: async (userId: number) => {
      tokenCalls.push(userId);
      return `token-${userId}`;
    },
    getMe: async () => ({ username: "Manager", can_manage_bots: true }),
  } as unknown as Api;

  const deps: BotManagerDeps = {
    storage,
    rateLimiter: {} as unknown as RateLimiter,
    budgetGuard: {} as unknown as BudgetGuard,
    ai: {} as unknown as AIClient,
    ownerId: "1",
    mainApi,
    mainBotId: "1000",
    logFormat: "json",
    logIncomingUpdates: false,
    logDebug: false,
  };
  return { manager: new BotManager(deps), tokenCalls };
}

test("a managed_bot update from a non-owner is ignored entirely", async () => {
  const storage = new MemoryStorage();
  const { manager, tokenCalls } = makeManager(storage);

  const res = await manager.handleManagedBotCreated("999", {
    id: 555,
    username: "CatBot",
    first_name: "Cat",
  });

  expect(res).toBeNull();
  expect(tokenCalls).toEqual([]); // no token brokered
  expect(await storage.listManagedBots()).toEqual([]); // no record persisted
});

test("deleteBot removes the registry record and the stored token", async () => {
  const storage = new MemoryStorage();
  const { manager } = makeManager(storage);
  const record: ManagedBot = {
    botId: "555",
    ownerUserId: "1",
    username: "CatBot",
    displayName: "Cat",
    systemPrompt: "p",
    createdAtMs: 0,
  };
  await storage.saveManagedBot(record);
  await storage.setManagedBotToken("555", "tok");

  await manager.deleteBot("555");

  expect(await storage.getManagedBot("555")).toBeNull();
  expect(await storage.getManagedBotToken("555")).toBeNull();
  expect(manager.isRunning("555")).toBe(false);
});

test("reminderRuntimes is empty when no managed bots are running", () => {
  const storage = new MemoryStorage();
  const { manager } = makeManager(storage);
  expect(manager.reminderRuntimes()).toEqual([]);
});
