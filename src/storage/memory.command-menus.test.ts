// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect } from "bun:test";
import { MemoryStorage } from "./memory";

test("chat command menus: record, read back, and forget", async () => {
  const s = new MemoryStorage();
  expect(await s.commandMenus.has("chat-1", "cat")).toBe(false);

  await s.commandMenus.record({ chatId: "chat-1", botId: "cat", atMs: 1000 });
  await s.commandMenus.record({ chatId: "chat-1", botId: "dog", atMs: 2000 });
  await s.commandMenus.record({ chatId: "chat-2", botId: "cat", atMs: 3000 });

  expect(await s.commandMenus.has("chat-1", "cat")).toBe(true);
  // Per bot AND per chat: the same bot may hold a menu in one chat and not
  // another, which is the whole point of resolving it per chat.
  expect(await s.commandMenus.has("chat-2", "dog")).toBe(false);

  // Re-recording updates the instant in place.
  await s.commandMenus.record({ chatId: "chat-1", botId: "cat", atMs: 4000 });

  // The rollback list Telegram cannot be asked for.
  expect(await s.commandMenus.list()).toEqual([
    { chatId: "chat-1", botId: "cat", atMs: 4000 },
    { chatId: "chat-1", botId: "dog", atMs: 2000 },
    { chatId: "chat-2", botId: "cat", atMs: 3000 },
  ]);

  await s.commandMenus.forget("chat-1", "cat");
  expect(await s.commandMenus.has("chat-1", "cat")).toBe(false);
  expect(await s.commandMenus.list()).toEqual([
    { chatId: "chat-1", botId: "dog", atMs: 2000 },
    { chatId: "chat-2", botId: "cat", atMs: 3000 },
  ]);

  // Forgetting what was never recorded is a no-op.
  await s.commandMenus.forget("chat-9", "cat");
  expect(await s.commandMenus.list()).toHaveLength(2);
});

test("chat command menus are a shared registry across forBot scopes", async () => {
  const base = new MemoryStorage();
  await base.commandMenus.record({ chatId: "g", botId: "main", atMs: 5000 });

  const catView = base.forBot("cat");
  expect(await catView.commandMenus.has("g", "main")).toBe(true);

  await catView.commandMenus.record({ chatId: "g", botId: "cat", atMs: 6000 });
  expect(await base.commandMenus.list()).toEqual([
    { chatId: "g", botId: "main", atMs: 5000 },
    { chatId: "g", botId: "cat", atMs: 6000 },
  ]);
});
