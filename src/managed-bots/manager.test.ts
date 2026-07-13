// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect } from "bun:test";
import { GrammyError, type Api } from "grammy";
import { MemoryStorage } from "../storage/memory";
import { BotManager, type BotManagerDeps } from "./manager";
import type { RateLimiter } from "../ratelimit/types";
import type { BudgetGuard } from "../budget/types";
import type { AIClient } from "../ai/types";
import type { ManagedBot } from "./types";

// The manager only brokers tokens through the main bot's api here; the
// network-bound startBot path (getMe + bot.start) is exercised in live runs,
// not unit tests, matching the project's no-live-network test policy.
function makeManager(
  storage: MemoryStorage,
  // Overrides the token brokered per re-fetch; throw to simulate a bot that no
  // longer exists in @BotFather.
  broker: (userId: number) => Promise<string> = async (userId) =>
    `token-${userId}`,
) {
  const tokenCalls: number[] = [];
  const mainApi = {
    getManagedBotToken: async (userId: number) => {
      tokenCalls.push(userId);
      return broker(userId);
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
  return { manager: new RestartSpyManager(deps), tokenCalls };
}

// Records startBot calls instead of spinning up a real (network-bound) grammY
// bot, so crash-recovery tests stay offline.
class RestartSpyManager extends BotManager {
  readonly restarts: Array<{ record: ManagedBot; token: string }> = [];
  override async startBot(record: ManagedBot, token: string): Promise<void> {
    this.restarts.push({ record, token });
  }
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

// --- polling-crash recovery ---

const record555: ManagedBot = {
  botId: "555",
  ownerUserId: "1",
  username: "CatBot",
  displayName: "Cat",
  systemPrompt: "p",
  createdAtMs: 0,
};

const unauthorized = () =>
  new GrammyError(
    "Call to 'getUpdates' failed!",
    { ok: false, error_code: 401, description: "Unauthorized" },
    "getUpdates",
    {},
  );

test("a non-401 polling crash leaves the bot stopped without re-brokering", async () => {
  const storage = new MemoryStorage();
  const { manager, tokenCalls } = makeManager(storage);
  await storage.saveManagedBot(record555);
  await storage.setManagedBotToken("555", "tok");

  await manager.handlePollingCrash(record555, "tok", new Error("boom"));

  expect(tokenCalls).toEqual([]);
  expect(manager.restarts).toEqual([]);
  // The token got no 401 — it may still be valid (e.g. a 409 conflict).
  expect(await storage.getManagedBotToken("555")).toBe("tok");
});

test("a 401 crash for a bot deleted in BotFather drops the revoked token, keeps the record", async () => {
  const storage = new MemoryStorage();
  const { manager, tokenCalls } = makeManager(storage, async () => {
    throw new Error("bot not found");
  });
  await storage.saveManagedBot(record555);
  await storage.setManagedBotToken("555", "tok");

  await manager.handlePollingCrash(record555, "tok", unauthorized());

  expect(tokenCalls).toEqual([555]);
  expect(manager.restarts).toEqual([]);
  expect(await storage.getManagedBotToken("555")).toBeNull();
  // The record stays so the owner can delete the bot from the admin UI.
  expect(await storage.getManagedBot("555")).toEqual(record555);
});

test("a 401 crash with an unchanged re-brokered token does not restart (no crash loop)", async () => {
  const storage = new MemoryStorage();
  const { manager } = makeManager(storage, async () => "tok");
  await storage.saveManagedBot(record555);
  await storage.setManagedBotToken("555", "tok");

  await manager.handlePollingCrash(record555, "tok", unauthorized());

  expect(manager.restarts).toEqual([]);
  expect(await storage.getManagedBotToken("555")).toBeNull();
});

test("a 401 crash after a token rotation restarts the bot with the fresh token", async () => {
  const storage = new MemoryStorage();
  const { manager } = makeManager(storage, async () => "tok-rotated");
  await storage.saveManagedBot(record555);
  await storage.setManagedBotToken("555", "tok");

  await manager.handlePollingCrash(record555, "tok", unauthorized());

  expect(manager.restarts).toEqual([
    { record: record555, token: "tok-rotated" },
  ]);
  expect(await storage.getManagedBotToken("555")).toBe("tok-rotated");
});

test("a 401 crash does not resurrect a bot deleted via the admin UI meanwhile", async () => {
  const storage = new MemoryStorage();
  const { manager } = makeManager(storage, async () => "tok-rotated");
  // No record in storage: deleteBot won the race against recovery.
  await manager.handlePollingCrash(record555, "tok", unauthorized());

  expect(manager.restarts).toEqual([]);
  expect(await storage.getManagedBotToken("555")).toBeNull();
});
