// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import type { BotCommand, BotCommandScope } from "grammy/types";
import {
  BOT_COMMAND_SCOPES,
  BOT_COMMANDS_EN,
  BOT_COMMANDS_RU,
  OWNER_COMMANDS_EN,
  OWNER_COMMANDS_RU,
  PRIVATE_COMMANDS_EN,
  PRIVATE_COMMANDS_RU,
  syncBotCommands,
  type SyncCommandsApi,
} from "./commands";

describe("command lists", () => {
  test("English list matches the expected shape", () => {
    expect(BOT_COMMANDS_EN).toEqual([
      { command: "ask", description: "Ask (short answer)" },
      { command: "askwise", description: "Ask (detailed answer)" },
    ]);
  });

  test("Russian list matches the expected shape", () => {
    expect(BOT_COMMANDS_RU).toEqual([
      { command: "ask", description: "Спросить (коротко)" },
      { command: "askwise", description: "Спросить (подробно)" },
    ]);
  });

  test("private lists extend the public ones with /usage", () => {
    expect(PRIVATE_COMMANDS_EN).toEqual([
      ...BOT_COMMANDS_EN,
      { command: "usage", description: "Your limits, in percent" },
    ]);
    expect(PRIVATE_COMMANDS_RU).toEqual([
      ...BOT_COMMANDS_RU,
      { command: "usage", description: "Твои лимиты, в процентах" },
    ]);
  });

  test("each command name matches Telegram's allowed shape", () => {
    for (const list of [
      BOT_COMMANDS_EN,
      BOT_COMMANDS_RU,
      PRIVATE_COMMANDS_EN,
      PRIVATE_COMMANDS_RU,
      OWNER_COMMANDS_EN,
      OWNER_COMMANDS_RU,
    ]) {
      for (const { command } of list) {
        expect(command.length).toBeGreaterThanOrEqual(1);
        expect(command.length).toBeLessThanOrEqual(32);
        expect(command).toMatch(/^[a-z0-9_]+$/);
      }
    }
  });

  test("each description is within Telegram's allowed length", () => {
    for (const list of [
      BOT_COMMANDS_EN,
      BOT_COMMANDS_RU,
      PRIVATE_COMMANDS_EN,
      PRIVATE_COMMANDS_RU,
      OWNER_COMMANDS_EN,
      OWNER_COMMANDS_RU,
    ]) {
      for (const { description } of list) {
        expect(description.length).toBeGreaterThanOrEqual(1);
        expect(description.length).toBeLessThanOrEqual(256);
      }
    }
  });
});

describe("BOT_COMMAND_SCOPES", () => {
  test("includes all_private_chats, all_group_chats and all_chat_administrators", () => {
    expect(BOT_COMMAND_SCOPES).toEqual([
      { type: "all_private_chats" },
      { type: "all_group_chats" },
      { type: "all_chat_administrators" },
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
      // Private chats get the DM-only `/usage` on top of the public list.
      const isPrivate = scope.type === "all_private_chats";
      const en = isPrivate ? PRIVATE_COMMANDS_EN : BOT_COMMANDS_EN;
      const ru = isPrivate ? PRIVATE_COMMANDS_RU : BOT_COMMANDS_RU;
      expect(calls[i]!.commands).toEqual(en);
      expect(calls[i]!.other).toEqual({ scope });
      i++;
      expect(calls[i]!.commands).toEqual(en);
      expect(calls[i]!.other).toEqual({ scope, language_code: "en" });
      i++;
      expect(calls[i]!.commands).toEqual(ru);
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
      PRIVATE_COMMANDS_EN,
      PRIVATE_COMMANDS_EN,
      PRIVATE_COMMANDS_RU,
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
    // `/usage` is DM-only — it must not appear in a group menu.
    for (const c of groupScopeCalls) {
      expect(c.commands.map((cmd) => cmd.command)).not.toContain("usage");
    }
    expect(groupScopeCalls.map((c) => c.commands)).toEqual([
      BOT_COMMANDS_EN,
      BOT_COMMANDS_EN,
      BOT_COMMANDS_RU,
    ]);
  });

  test("registers commands under BotCommandScopeAllChatAdministrators", async () => {
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

    const adminScopeCalls = calls.filter(
      (c) => c.other?.scope?.type === "all_chat_administrators",
    );
    expect(adminScopeCalls).toHaveLength(3);
    expect(adminScopeCalls.map((c) => c.commands)).toEqual([
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

  test("adds /digest under a chat scope for the owner only", async () => {
    const calls: Array<{
      commands: readonly BotCommand[];
      other?: { language_code?: string; scope?: BotCommandScope };
    }> = [];
    const api: SyncCommandsApi = {
      async setMyCommands(commands, other) {
        calls.push({ commands, other });
      },
    };

    await syncBotCommands(api, "12345");

    const ownerCalls = calls.filter((c) => c.other?.scope?.type === "chat");
    expect(ownerCalls).toHaveLength(3);
    for (const c of ownerCalls) {
      expect(c.other?.scope).toEqual({ type: "chat", chat_id: "12345" });
    }
    expect(ownerCalls.map((c) => c.commands)).toEqual([
      OWNER_COMMANDS_EN,
      OWNER_COMMANDS_EN,
      OWNER_COMMANDS_RU,
    ]);
    // Every other scope keeps the public list — /digest is owner-only.
    for (const c of calls.filter((x) => x.other?.scope?.type !== "chat")) {
      expect(c.commands.map((cmd) => cmd.command)).not.toContain("digest");
    }
  });

  test("owner lists extend the private ones with /digest", () => {
    expect(OWNER_COMMANDS_EN.slice(0, PRIVATE_COMMANDS_EN.length)).toEqual([
      ...PRIVATE_COMMANDS_EN,
    ]);
    expect(OWNER_COMMANDS_RU.slice(0, PRIVATE_COMMANDS_RU.length)).toEqual([
      ...PRIVATE_COMMANDS_RU,
    ]);
    for (const list of [OWNER_COMMANDS_EN, OWNER_COMMANDS_RU]) {
      expect(list.map((c) => c.command)).toContain("digest");
    }
  });
});
