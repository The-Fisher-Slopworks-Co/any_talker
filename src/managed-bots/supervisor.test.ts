// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect } from "bun:test";
import { GrammyError, type Api } from "grammy";
import { MemoryStorage } from "../storage/memory";
import { createRuntime, type BotManagerDeps } from "./runtime";
import { recoverFromPollingCrash } from "./supervisor";
import type { RateLimiter } from "../ratelimit/types";
import type { BudgetGuard } from "../budget/types";
import type { AIClient } from "../ai/types";
import type { ManagedBot } from "./types";

// The supervisor only brokers tokens through the main bot's api here, and its
// restart hook records instead of spinning up a real (network-bound) grammY
// bot, so crash recovery is exercised offline — the startBot path itself
// (getMe + bot.start) is covered by live runs, matching the project's
// no-live-network test policy.
function makeRuntime(
  storage: MemoryStorage,
  // Overrides the token brokered per re-fetch; throw to simulate a bot that no
  // longer exists in @BotFather.
  broker: (userId: number) => Promise<string> = async (userId) =>
    `token-${userId}`,
) {
  const tokenCalls: number[] = [];
  const restarts: Array<{ record: ManagedBot; token: string }> = [];
  const mainApi = {
    getManagedBotToken: async (userId: number) => {
      tokenCalls.push(userId);
      return broker(userId);
    },
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
  const runtime = createRuntime(deps, async (record, token) => {
    restarts.push({ record, token });
  });
  return { runtime, tokenCalls, restarts };
}

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
  const { runtime, tokenCalls, restarts } = makeRuntime(storage);
  await storage.saveManagedBot(record555);
  await storage.setManagedBotToken("555", "tok");

  await recoverFromPollingCrash(runtime, record555, "tok", new Error("boom"));

  expect(tokenCalls).toEqual([]);
  expect(restarts).toEqual([]);
  // The token got no 401 — it may still be valid (e.g. a 409 conflict).
  expect(await storage.getManagedBotToken("555")).toBe("tok");
});

test("a 401 crash for a bot deleted in BotFather drops the revoked token, keeps the record", async () => {
  const storage = new MemoryStorage();
  const { runtime, tokenCalls, restarts } = makeRuntime(storage, async () => {
    throw new Error("bot not found");
  });
  await storage.saveManagedBot(record555);
  await storage.setManagedBotToken("555", "tok");

  await recoverFromPollingCrash(runtime, record555, "tok", unauthorized());

  expect(tokenCalls).toEqual([555]);
  expect(restarts).toEqual([]);
  expect(await storage.getManagedBotToken("555")).toBeNull();
  // The record stays so the owner can delete the bot from the admin UI.
  expect(await storage.getManagedBot("555")).toEqual(record555);
});

test("a 401 crash with an unchanged re-brokered token does not restart (no crash loop)", async () => {
  const storage = new MemoryStorage();
  const { runtime, restarts } = makeRuntime(storage, async () => "tok");
  await storage.saveManagedBot(record555);
  await storage.setManagedBotToken("555", "tok");

  await recoverFromPollingCrash(runtime, record555, "tok", unauthorized());

  expect(restarts).toEqual([]);
  expect(await storage.getManagedBotToken("555")).toBeNull();
});

test("a 401 crash after a token rotation restarts the bot with the fresh token", async () => {
  const storage = new MemoryStorage();
  const { runtime, restarts } = makeRuntime(storage, async () => "tok-rotated");
  await storage.saveManagedBot(record555);
  await storage.setManagedBotToken("555", "tok");

  await recoverFromPollingCrash(runtime, record555, "tok", unauthorized());

  expect(restarts).toEqual([{ record: record555, token: "tok-rotated" }]);
  expect(await storage.getManagedBotToken("555")).toBe("tok-rotated");
});

test("a 401 crash does not resurrect a bot deleted via the admin UI meanwhile", async () => {
  const storage = new MemoryStorage();
  const { runtime, restarts } = makeRuntime(storage, async () => "tok-rotated");
  // No record in storage: deleteBot won the race against recovery.
  await recoverFromPollingCrash(runtime, record555, "tok", unauthorized());

  expect(restarts).toEqual([]);
  expect(await storage.getManagedBotToken("555")).toBeNull();
});
