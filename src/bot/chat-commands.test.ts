// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import type { BotCommand, BotCommandScope } from "grammy/types";
import { MemoryStorage } from "../storage/memory";
import type { Storage } from "../storage/types";
import { BOT_PRESENCE_TTL_MS } from "./routing";
import {
  dropChatMenu,
  makeChatMenuSync,
  type ChatCommandsApi,
} from "./chat-commands";

const NOW = 1_700_000_000_000;
// Telegram ids, smallest first: the main bot and two character bots.
const MAIN = "100";
const CAT = "200";
const DOG = "300";

type Call = {
  commands?: readonly BotCommand[] | undefined;
  scope: BotCommandScope | undefined;
  lang: string | undefined;
};

function fakeApi(): {
  api: ChatCommandsApi;
  uploads: Call[];
  deletions: Call[];
} {
  const uploads: Call[] = [];
  const deletions: Call[] = [];
  return {
    uploads,
    deletions,
    api: {
      async setMyCommands(commands, other) {
        uploads.push({
          commands,
          scope: other?.scope,
          lang: other?.language_code,
        });
      },
      async deleteMyCommands(other) {
        deletions.push({ scope: other?.scope, lang: other?.language_code });
      },
    },
  };
}

// One bot's view of the family: everyone but itself.
function syncFor(storage: Storage, selfBotId: string, family: string[]) {
  return makeChatMenuSync({
    storage,
    siblingBotIds: () => family.filter((id) => id !== selfBotId),
  });
}

function names(call: Call): string[] {
  return (call.commands ?? []).map((c) => c.command);
}

// The two chats of the bug report: one holding the main bot and a character
// bot, one holding a second character bot on its own.
async function seedTwoChats(storage: Storage): Promise<void> {
  await storage.presence.record("chat-1", MAIN, NOW);
  await storage.presence.record("chat-1", CAT, NOW);
  await storage.presence.record("chat-2", DOG, NOW);
}

describe("makeChatMenuSync", () => {
  // The regression: resolving the owner family-wide hid `/feedback` from
  // "chat-2" as well, because the winner (the main bot) is not a member there.
  test("each chat is resolved on its own members", async () => {
    const storage = new MemoryStorage();
    await seedTwoChats(storage);
    const family = [MAIN, CAT, DOG];
    const main = fakeApi();
    const cat = fakeApi();
    const dog = fakeApi();

    const syncMain = syncFor(storage, MAIN, family);
    const syncCat = syncFor(storage, CAT, family);
    const syncDog = syncFor(storage, DOG, family);

    await syncMain({
      api: main.api,
      chatId: "chat-1",
      selfBotId: MAIN,
      nowMs: NOW,
    });
    await syncCat({
      api: cat.api,
      chatId: "chat-1",
      selfBotId: CAT,
      nowMs: NOW,
    });
    await syncDog({
      api: dog.api,
      chatId: "chat-2",
      selfBotId: DOG,
      nowMs: NOW,
    });

    // Smallest id in chat-1: nothing to upload, the global menu already lists
    // the shared commands.
    expect(main.uploads).toEqual([]);
    // The other bot there hides them, under a chat scope naming that chat only.
    expect(cat.uploads).toHaveLength(3);
    for (const call of cat.uploads) {
      expect(call.scope).toEqual({ type: "chat", chat_id: "chat-1" });
      expect(names(call)).not.toContain("feedback");
      expect(names(call)).toContain("ask");
    }
    expect(cat.uploads.map((c) => c.lang)).toEqual([undefined, "en", "ru"]);
    // Alone in its own chat, so it keeps them — the loss this fixes.
    expect(dog.uploads).toEqual([]);
    expect(await storage.commandMenus.list()).toEqual([
      { chatId: "chat-1", botId: CAT, atMs: NOW },
    ]);
  });

  test("an applied menu is not uploaded again", async () => {
    const storage = new MemoryStorage();
    await seedTwoChats(storage);
    const { api, uploads } = fakeApi();
    const sync = syncFor(storage, CAT, [MAIN, CAT, DOG]);

    await sync({ api, chatId: "chat-1", selfBotId: CAT, nowMs: NOW });
    await sync({ api, chatId: "chat-1", selfBotId: CAT, nowMs: NOW + 1000 });

    expect(uploads).toHaveLength(3);
  });

  test("the menu is handed back when the smaller bot leaves the chat", async () => {
    const storage = new MemoryStorage();
    await seedTwoChats(storage);
    const { api, uploads, deletions } = fakeApi();
    const sync = syncFor(storage, CAT, [MAIN, CAT, DOG]);
    await sync({ api, chatId: "chat-1", selfBotId: CAT, nowMs: NOW });

    await storage.presence.remove("chat-1", MAIN);
    await sync({ api, chatId: "chat-1", selfBotId: CAT, nowMs: NOW + 1000 });

    expect(uploads).toHaveLength(3);
    expect(deletions).toEqual([
      { scope: { type: "chat", chat_id: "chat-1" }, lang: undefined },
      { scope: { type: "chat", chat_id: "chat-1" }, lang: "en" },
      { scope: { type: "chat", chat_id: "chat-1" }, lang: "ru" },
    ]);
    expect(await storage.commandMenus.list()).toEqual([]);
  });

  // A deleted managed bot keeps its presence row until the TTL lapses; it must
  // not keep a command to itself in the meantime.
  test("a bot that is not in the family any more is ignored", async () => {
    const storage = new MemoryStorage();
    await seedTwoChats(storage);
    const { api, uploads } = fakeApi();

    await makeChatMenuSync({ storage, siblingBotIds: () => [DOG] })({
      api,
      chatId: "chat-1",
      selfBotId: CAT,
      nowMs: NOW,
    });

    expect(uploads).toEqual([]);
  });

  test("a stale presence record does not hide anything", async () => {
    const storage = new MemoryStorage();
    await storage.presence.record(
      "chat-1",
      MAIN,
      NOW - BOT_PRESENCE_TTL_MS - 1,
    );
    await storage.presence.record("chat-1", CAT, NOW);
    const { api, uploads } = fakeApi();

    const sync = syncFor(storage, CAT, [MAIN, CAT]);

    await sync({ api, chatId: "chat-1", selfBotId: CAT, nowMs: NOW });

    expect(uploads).toEqual([]);
  });

  // Telegram first, registry second: a row that claims an override nobody
  // applied would keep the bot from ever retrying.
  test("a failed upload is not recorded", async () => {
    const storage = new MemoryStorage();
    await seedTwoChats(storage);
    const api: ChatCommandsApi = {
      async setMyCommands() {
        throw new Error("network");
      },
      async deleteMyCommands() {},
    };

    const sync = syncFor(storage, CAT, [MAIN, CAT]);

    await expect(
      sync({ api, chatId: "chat-1", selfBotId: CAT, nowMs: NOW }),
    ).rejects.toThrow("network");
    expect(await storage.commandMenus.list()).toEqual([]);
  });
});

describe("dropChatMenu", () => {
  test("removes the bot's own menu and its row", async () => {
    const storage = new MemoryStorage();
    await storage.commandMenus.record({
      chatId: "chat-1",
      botId: CAT,
      atMs: NOW,
    });
    const { api, deletions } = fakeApi();

    await dropChatMenu({ api, storage, chatId: "chat-1", selfBotId: CAT });

    expect(deletions).toHaveLength(3);
    expect(await storage.commandMenus.has("chat-1", CAT)).toBe(false);
  });

  test("does nothing when the bot holds no menu there", async () => {
    const storage = new MemoryStorage();
    const { api, deletions } = fakeApi();

    await dropChatMenu({ api, storage, chatId: "chat-1", selfBotId: CAT });

    expect(deletions).toEqual([]);
  });
});
