// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import type { BotCommand, BotCommandScope } from "grammy/types";
import {
  BOT_COMMAND_SCOPES,
  BOT_COMMANDS_EN,
  BOT_COMMANDS_RU,
  groupCommandsWithoutShared,
  OWNER_COMMANDS_EN,
  OWNER_COMMANDS_RU,
  ownsSharedCommands,
  PRIVATE_COMMANDS_EN,
  PRIVATE_COMMANDS_RU,
  syncBotCommands,
  type FamilyCommand,
  type SyncCommandsApi,
} from "./commands";

// What Telegram actually receives: the family-level `shared` flag is ours and
// is stripped before the upload.
function plain(list: readonly FamilyCommand[]): BotCommand[] {
  return list.map(({ shared, ...cmd }) => {
    void shared;
    return cmd;
  });
}

function withoutShared(list: readonly FamilyCommand[]): BotCommand[] {
  return plain(list.filter((c) => !c.shared));
}

describe("command lists", () => {
  test("English list matches the expected shape", () => {
    expect(BOT_COMMANDS_EN).toEqual([
      { command: "ask", description: "Ask (short answer)" },
      { command: "askwise", description: "Ask (detailed answer)" },
      {
        command: "feedback",
        description: "Report a problem",
        is_ephemeral: true,
        shared: true,
      },
    ]);
  });

  test("Russian list matches the expected shape", () => {
    expect(BOT_COMMANDS_RU).toEqual([
      { command: "ask", description: "Спросить (коротко)" },
      { command: "askwise", description: "Спросить (подробно)" },
      {
        command: "feedback",
        description: "Сообщить о проблеме",
        is_ephemeral: true,
        shared: true,
      },
    ]);
  });

  // The flag is what gives the entry its icon in the group menu, where the
  // reply really is ephemeral.
  test("/feedback is marked ephemeral in the group lists", () => {
    for (const list of [BOT_COMMANDS_EN, BOT_COMMANDS_RU]) {
      const entry = list.find((c) => c.command === "feedback");
      expect(entry?.is_ephemeral).toBe(true);
    }
  });

  // A DM has nobody to hide the reply from, and an entry that claims otherwise
  // is what keeps `/feedback` out of a private chat.
  test("/feedback is listed without the flag in every DM list", () => {
    for (const list of [
      PRIVATE_COMMANDS_EN,
      PRIVATE_COMMANDS_RU,
      OWNER_COMMANDS_EN,
      OWNER_COMMANDS_RU,
    ]) {
      const entry = list.find((c) => c.command === "feedback");
      expect(entry).toBeDefined();
      expect(entry?.is_ephemeral).toBeUndefined();
    }
  });

  // `/feedback` behaves the same whichever family bot answers it; `/ask` and
  // `/askwise` address one specific character, so they are per-bot.
  test("only /feedback is marked shared", () => {
    for (const list of [
      BOT_COMMANDS_EN,
      BOT_COMMANDS_RU,
      PRIVATE_COMMANDS_EN,
      PRIVATE_COMMANDS_RU,
      OWNER_COMMANDS_EN,
      OWNER_COMMANDS_RU,
    ]) {
      expect(list.filter((c) => c.shared).map((c) => c.command)).toEqual([
        "feedback",
      ]);
    }
  });

  test("private lists extend the public ones with /usage", () => {
    expect(PRIVATE_COMMANDS_EN).toEqual([
      { command: "ask", description: "Ask (short answer)" },
      { command: "askwise", description: "Ask (detailed answer)" },
      { command: "feedback", description: "Report a problem", shared: true },
      { command: "usage", description: "Your limits, in percent" },
    ]);
    expect(PRIVATE_COMMANDS_RU).toEqual([
      { command: "ask", description: "Спросить (коротко)" },
      { command: "askwise", description: "Спросить (подробно)" },
      { command: "feedback", description: "Сообщить о проблеме", shared: true },
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

describe("ownsSharedCommands", () => {
  test("the smallest id in the family owns them", () => {
    expect(ownsSharedCommands("100", ["100", "200", "300"])).toBe(true);
    expect(ownsSharedCommands("200", ["100", "200", "300"])).toBe(false);
    expect(ownsSharedCommands("300", ["100", "200", "300"])).toBe(false);
  });

  test("ids are compared as numbers, not as strings", () => {
    // Lexicographically "10000" < "9999"; numerically it is the other way round.
    expect(ownsSharedCommands("9999", ["9999", "10000"])).toBe(true);
    expect(ownsSharedCommands("10000", ["9999", "10000"])).toBe(false);
  });

  test("a lone bot owns them", () => {
    expect(ownsSharedCommands("777", ["777"])).toBe(true);
    expect(ownsSharedCommands("777", [])).toBe(true);
    expect(ownsSharedCommands("777", undefined)).toBe(true);
  });

  // Dropping the entry on a bot whose id we could not learn would lose the
  // feature outright; a duplicate is the lesser evil.
  test("an unknown or unparsable id keeps them", () => {
    expect(ownsSharedCommands(undefined, ["100"])).toBe(true);
    expect(ownsSharedCommands("nope", ["100"])).toBe(true);
    expect(ownsSharedCommands("200", ["nope", "300"])).toBe(true);
  });
});

type SetMyCommandsCall = {
  commands: readonly BotCommand[];
  other?: { language_code?: string; scope?: BotCommandScope } | undefined;
};

function recordingApi(): { api: SyncCommandsApi; calls: SetMyCommandsCall[] } {
  const calls: SetMyCommandsCall[] = [];
  return {
    calls,
    api: {
      async setMyCommands(commands, other) {
        calls.push({ commands, other });
      },
    },
  };
}

describe("syncBotCommands", () => {
  test("uploads default + en + ru, and repeats each combo under every scope", async () => {
    const { api, calls } = recordingApi();

    await syncBotCommands(api);

    expect(calls).toHaveLength(3 + BOT_COMMAND_SCOPES.length * 3);

    expect(calls[0]!.commands).toEqual(plain(BOT_COMMANDS_EN));
    expect(calls[0]!.other).toBeUndefined();
    expect(calls[1]!.commands).toEqual(plain(BOT_COMMANDS_EN));
    expect(calls[1]!.other).toEqual({ language_code: "en" });
    expect(calls[2]!.commands).toEqual(plain(BOT_COMMANDS_RU));
    expect(calls[2]!.other).toEqual({ language_code: "ru" });

    let i = 3;
    for (const scope of BOT_COMMAND_SCOPES) {
      // Private chats get the DM-only `/usage` on top of the public list.
      const isPrivate = scope.type === "all_private_chats";
      const en = plain(isPrivate ? PRIVATE_COMMANDS_EN : BOT_COMMANDS_EN);
      const ru = plain(isPrivate ? PRIVATE_COMMANDS_RU : BOT_COMMANDS_RU);
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

  test("never uploads the internal `shared` flag to Telegram", async () => {
    const { api, calls } = recordingApi();

    await syncBotCommands(api, { ownerId: "12345" });

    for (const call of calls) {
      for (const cmd of call.commands) {
        expect(Object.keys(cmd)).not.toContain("shared");
      }
    }
  });

  test("registers commands under BotCommandScopeAllPrivateChats", async () => {
    const { api, calls } = recordingApi();

    await syncBotCommands(api);

    const privateScopeCalls = calls.filter(
      (c) => c.other?.scope?.type === "all_private_chats",
    );
    expect(privateScopeCalls).toHaveLength(3);
    expect(privateScopeCalls.map((c) => c.commands)).toEqual([
      plain(PRIVATE_COMMANDS_EN),
      plain(PRIVATE_COMMANDS_EN),
      plain(PRIVATE_COMMANDS_RU),
    ]);
  });

  test("registers commands under BotCommandScopeAllGroupChats", async () => {
    const { api, calls } = recordingApi();

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
      plain(BOT_COMMANDS_EN),
      plain(BOT_COMMANDS_EN),
      plain(BOT_COMMANDS_RU),
    ]);
  });

  test("registers commands under BotCommandScopeAllChatAdministrators", async () => {
    const { api, calls } = recordingApi();

    await syncBotCommands(api);

    const adminScopeCalls = calls.filter(
      (c) => c.other?.scope?.type === "all_chat_administrators",
    );
    expect(adminScopeCalls).toHaveLength(3);
    expect(adminScopeCalls.map((c) => c.commands)).toEqual([
      plain(BOT_COMMANDS_EN),
      plain(BOT_COMMANDS_EN),
      plain(BOT_COMMANDS_RU),
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
    const { api, calls } = recordingApi();

    await syncBotCommands(api, { ownerId: "12345" });

    const ownerCalls = calls.filter((c) => c.other?.scope?.type === "chat");
    expect(ownerCalls).toHaveLength(3);
    for (const c of ownerCalls) {
      expect(c.other?.scope).toEqual({ type: "chat", chat_id: "12345" });
    }
    expect(ownerCalls.map((c) => c.commands)).toEqual([
      plain(OWNER_COMMANDS_EN),
      plain(OWNER_COMMANDS_EN),
      plain(OWNER_COMMANDS_RU),
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

// #151 hid the shared commands from the group-facing scopes of every bot but
// the family-wide smallest id — including in the groups that bot was not a
// member of, where nobody listed them at all. The global lists carry them for
// every bot again; the de-duplication is a chat-scoped menu now, resolved per
// chat (`chat-commands.test.ts`).
describe("shared commands in the global scopes", () => {
  test("every scope keeps them, whichever bot uploads", async () => {
    const { api, calls } = recordingApi();

    await syncBotCommands(api, { ownerId: "1" });

    for (const c of calls) {
      expect(c.commands.map((cmd) => cmd.command)).toContain("feedback");
    }
  });

  test("the chat-scoped list is the group list minus the shared commands", () => {
    expect(groupCommandsWithoutShared("en")).toEqual(
      withoutShared(BOT_COMMANDS_EN),
    );
    expect(groupCommandsWithoutShared("ru")).toEqual(
      withoutShared(BOT_COMMANDS_RU),
    );
    for (const lang of ["en", "ru"] as const) {
      const names = groupCommandsWithoutShared(lang).map((c) => c.command);
      expect(names).not.toContain("feedback");
      // Only the shared ones go: the per-character commands stay on every bot.
      expect(names).toContain("ask");
    }
  });
});
