// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import type { BotCommand, BotCommandScope } from "grammy/types";
import {
  BOT_COMMAND_SCOPES,
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

describe("BOT_COMMAND_SCOPES", () => {
  test("includes all_private_chats and all_group_chats", () => {
    expect(BOT_COMMAND_SCOPES).toEqual([
      { type: "all_private_chats" },
      { type: "all_group_chats" },
    ]);
  });
});

describe("syncBotCommands", () => {
  test("uploads default + en + ru, and repeats each combo under every scope", async () => {
    const calls: Array<{
      commands: readonly BotCommand[];
      other?: { language_code?: string; scope?: BotCommandScope };
    }> = [];
    const api: SyncCommandsApi = {
      async setMyCommands(commands, other) {
        calls.push({ commands, other });
      },
    };

    await syncBotCommands(api);

    expect(calls).toHaveLength(3 + BOT_COMMAND_SCOPES.length * 3);

    expect(calls[0]!.commands).toEqual(BOT_COMMANDS_EN);
    expect(calls[0]!.other).toBeUndefined();
    expect(calls[1]!.commands).toEqual(BOT_COMMANDS_EN);
    expect(calls[1]!.other).toEqual({ language_code: "en" });
    expect(calls[2]!.commands).toEqual(BOT_COMMANDS_RU);
    expect(calls[2]!.other).toEqual({ language_code: "ru" });

    let i = 3;
    for (const scope of BOT_COMMAND_SCOPES) {
      expect(calls[i]!.commands).toEqual(BOT_COMMANDS_EN);
      expect(calls[i]!.other).toEqual({ scope });
      i++;
      expect(calls[i]!.commands).toEqual(BOT_COMMANDS_EN);
      expect(calls[i]!.other).toEqual({ scope, language_code: "en" });
      i++;
      expect(calls[i]!.commands).toEqual(BOT_COMMANDS_RU);
      expect(calls[i]!.other).toEqual({ scope, language_code: "ru" });
      i++;
    }
  });

  test("registers commands under BotCommandScopeAllPrivateChats", async () => {
    const calls: Array<{
      commands: readonly BotCommand[];
      other?: { language_code?: string; scope?: BotCommandScope };
    }> = [];
    const api: SyncCommandsApi = {
      async setMyCommands(commands, other) {
        calls.push({ commands, other });
      },
    };

    await syncBotCommands(api);

    const privateScopeCalls = calls.filter(
      (c) => c.other?.scope?.type === "all_private_chats",
    );
    expect(privateScopeCalls).toHaveLength(3);
    expect(privateScopeCalls.map((c) => c.commands)).toEqual([
      BOT_COMMANDS_EN,
      BOT_COMMANDS_EN,
      BOT_COMMANDS_RU,
    ]);
  });

  test("registers commands under BotCommandScopeAllGroupChats", async () => {
    const calls: Array<{
      commands: readonly BotCommand[];
      other?: { language_code?: string; scope?: BotCommandScope };
    }> = [];
    const api: SyncCommandsApi = {
      async setMyCommands(commands, other) {
        calls.push({ commands, other });
      },
    };

    await syncBotCommands(api);

    const groupScopeCalls = calls.filter(
      (c) => c.other?.scope?.type === "all_group_chats",
    );
    expect(groupScopeCalls).toHaveLength(3);
    expect(groupScopeCalls.map((c) => c.commands)).toEqual([
      BOT_COMMANDS_EN,
      BOT_COMMANDS_EN,
      BOT_COMMANDS_RU,
    ]);
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
