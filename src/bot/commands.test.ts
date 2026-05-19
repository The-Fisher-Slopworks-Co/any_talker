// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import type { BotCommand } from "grammy/types";
import {
  BOT_COMMANDS_RU,
  syncBotCommands,
  type SyncCommandsApi,
} from "./commands";

describe("BOT_COMMANDS_RU", () => {
  test("includes ask with the expected description", () => {
    expect(BOT_COMMANDS_RU).toEqual([
      { command: "ask", description: "Спросить мудреца" },
    ]);
  });

  test("each command name matches Telegram's allowed shape", () => {
    for (const { command } of BOT_COMMANDS_RU) {
      expect(command.length).toBeGreaterThanOrEqual(1);
      expect(command.length).toBeLessThanOrEqual(32);
      expect(command).toMatch(/^[a-z0-9_]+$/);
    }
  });

  test("each description is within Telegram's allowed length", () => {
    for (const { description } of BOT_COMMANDS_RU) {
      expect(description.length).toBeGreaterThanOrEqual(1);
      expect(description.length).toBeLessThanOrEqual(256);
    }
  });
});

describe("syncBotCommands", () => {
  test("uploads commands as default and for Russian language", async () => {
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
    expect(calls[0]!.commands).toEqual(BOT_COMMANDS_RU);
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
