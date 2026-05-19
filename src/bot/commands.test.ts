// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import type { BotCommand } from "grammy/types";
import {
  BOT_COMMANDS_EN,
  BOT_COMMANDS_RU,
  syncBotCommands,
  type SyncCommandsApi,
} from "./commands";

describe("command lists", () => {
  test("English list matches the expected shape", () => {
    expect(BOT_COMMANDS_EN).toEqual([
      { command: "ask", description: "Ask (short answer)" },
      { command: "askmore", description: "Ask (detailed answer)" },
      { command: "askwise", description: "Ask wise man (exhaustive answer)" },
    ]);
  });

  test("Russian list matches the expected shape", () => {
    expect(BOT_COMMANDS_RU).toEqual([
      { command: "ask", description: "Спросить (коротко)" },
      { command: "askmore", description: "Спросить (подробно)" },
      { command: "askwise", description: "Спросить мудреца (исчерпывающе)" },
    ]);
  });

  test("each command name matches Telegram's allowed shape", () => {
    for (const list of [BOT_COMMANDS_EN, BOT_COMMANDS_RU]) {
      for (const { command } of list) {
        expect(command.length).toBeGreaterThanOrEqual(1);
        expect(command.length).toBeLessThanOrEqual(32);
        expect(command).toMatch(/^[a-z0-9_]+$/);
      }
    }
  });

  test("each description is within Telegram's allowed length", () => {
    for (const list of [BOT_COMMANDS_EN, BOT_COMMANDS_RU]) {
      for (const { description } of list) {
        expect(description.length).toBeGreaterThanOrEqual(1);
        expect(description.length).toBeLessThanOrEqual(256);
      }
    }
  });
});

describe("syncBotCommands", () => {
  test("uploads English as default and Russian under language_code ru", async () => {
    const calls: Array<{
      commands: readonly BotCommand[];
      other?: { language_code?: string };
    }> = [];
    const api: SyncCommandsApi = {
      async setMyCommands(commands, other) {
        calls.push({ commands, other });
      },
    };

    await syncBotCommands(api);

    expect(calls).toHaveLength(2);
    expect(calls[0]!.commands).toEqual(BOT_COMMANDS_EN);
    expect(calls[0]!.other).toBeUndefined();
    expect(calls[1]!.commands).toEqual(BOT_COMMANDS_RU);
    expect(calls[1]!.other).toEqual({ language_code: "ru" });
  });

  test("propagates errors from the API", async () => {
    const api: SyncCommandsApi = {
      async setMyCommands() {
        throw new Error("network");
      },
    };
    await expect(syncBotCommands(api)).rejects.toThrow("network");
  });
});
