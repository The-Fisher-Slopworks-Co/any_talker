// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect } from "bun:test";
import type { Api, Bot } from "grammy";
import type { BotCommand, BotCommandScope } from "grammy/types";
import type { BotContext } from "../bot/middleware/lang";
import { MemoryStorage } from "../storage/memory";
import { syncCommandsAfterStart, syncFamilyCommands } from "./commands";
import { createRuntime, type BotManagerDeps } from "./runtime";
import type { RateLimiter } from "../ratelimit/types";
import type { BudgetGuard } from "../budget/types";
import type { AIClient } from "../ai/types";
import type { ManagedBot } from "./types";

type Upload = {
  botId: string;
  commands: readonly BotCommand[];
  scope: BotCommandScope | undefined;
};

// One recording stand-in for a bot's api: `syncFamilyCommands` only ever calls
// `setMyCommands` on it, so a real (network-bound) grammY bot is not needed.
function fakeApi(botId: string, uploads: Upload[]): Api {
  return {
    setMyCommands: async (
      commands: readonly BotCommand[],
      other?: { scope?: BotCommandScope },
    ) => {
      uploads.push({ botId, commands, scope: other?.scope });
      return true;
    },
  } as unknown as Api;
}

function record(botId: string): ManagedBot {
  return {
    botId,
    ownerUserId: "1",
    username: `bot${botId}`,
    displayName: `Bot ${botId}`,
    systemPrompt: "p",
    createdAtMs: 0,
  };
}

function makeRuntime(mainBotId: string, managedBotIds: readonly string[]) {
  const uploads: Upload[] = [];
  const deps: BotManagerDeps = {
    storage: new MemoryStorage(),
    rateLimiter: {} as unknown as RateLimiter,
    budgetGuard: {} as unknown as BudgetGuard,
    ai: {} as unknown as AIClient,
    ownerId: "1",
    mainApi: fakeApi(mainBotId, uploads),
    mainBotId,
    logFormat: "json",
    logIncomingUpdates: false,
    logDebug: false,
  };
  const runtime = createRuntime(deps, async () => {});
  for (const botId of managedBotIds) {
    runtime.running.set(botId, {
      record: record(botId),
      bot: { api: fakeApi(botId, uploads) } as unknown as Bot<BotContext>,
    });
  }
  return { runtime, uploads };
}

// Which commands a given bot ends up listing in group chats — the menu the
// duplicate `/feedback` showed up in.
function groupCommands(uploads: Upload[], botId: string): string[][] {
  return uploads
    .filter((u) => u.botId === botId && u.scope?.type === "all_group_chats")
    .map((u) => u.commands.map((c) => c.command));
}

test("every family bot gets its menu synced", async () => {
  const { runtime, uploads } = makeRuntime("100", ["200", "300"]);

  await syncFamilyCommands(runtime);

  expect(new Set(uploads.map((u) => u.botId))).toEqual(
    new Set(["100", "200", "300"]),
  );
});

test("only the smallest id lists the shared commands in groups", async () => {
  const { runtime, uploads } = makeRuntime("100", ["200", "300"]);

  await syncFamilyCommands(runtime);

  for (const list of groupCommands(uploads, "100")) {
    expect(list).toContain("feedback");
  }
  for (const botId of ["200", "300"]) {
    for (const list of groupCommands(uploads, botId)) {
      expect(list).not.toContain("feedback");
      // The per-character commands stay on every bot.
      expect(list).toContain("ask");
    }
  }
});

test("a managed bot with an id below the main bot's takes them over", async () => {
  const { runtime, uploads } = makeRuntime("500", ["200"]);

  await syncFamilyCommands(runtime);

  for (const list of groupCommands(uploads, "200")) {
    expect(list).toContain("feedback");
  }
  for (const list of groupCommands(uploads, "500")) {
    expect(list).not.toContain("feedback");
  }
});

test("a lone main bot keeps the shared commands", async () => {
  const { runtime, uploads } = makeRuntime("500", []);

  await syncFamilyCommands(runtime);

  const lists = groupCommands(uploads, "500");
  expect(lists.length).toBeGreaterThan(0);
  for (const list of lists) {
    expect(list).toContain("feedback");
  }
});

test("one bot failing its upload does not skip the others", async () => {
  const { runtime, uploads } = makeRuntime("100", ["200"]);
  runtime.deps.mainApi.setMyCommands = async () => {
    throw new Error("network");
  };

  await syncFamilyCommands(runtime);

  expect(uploads.map((u) => u.botId)).not.toContain("100");
  expect(uploads.map((u) => u.botId)).toContain("200");
});

// A started bot that changes nothing for the others is not worth a dozen
// `setMyCommands` calls per sibling.
test("a started bot above the smallest id syncs only itself", async () => {
  const { runtime, uploads } = makeRuntime("100", ["200", "300"]);

  await syncCommandsAfterStart(runtime, "300");

  expect(new Set(uploads.map((u) => u.botId))).toEqual(new Set(["300"]));
  for (const list of groupCommands(uploads, "300")) {
    expect(list).not.toContain("feedback");
  }
});

test("a started bot with the smallest id re-syncs the whole family", async () => {
  const { runtime, uploads } = makeRuntime("500", ["200", "300"]);

  await syncCommandsAfterStart(runtime, "200");

  expect(new Set(uploads.map((u) => u.botId))).toEqual(
    new Set(["200", "300", "500"]),
  );
  for (const list of groupCommands(uploads, "200")) {
    expect(list).toContain("feedback");
  }
  // The main bot held the shared commands until now and has to give them up.
  for (const list of groupCommands(uploads, "500")) {
    expect(list).not.toContain("feedback");
  }
});
