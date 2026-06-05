// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect } from "bun:test";
import { MemoryStorage } from "./memory";

test("bot presence: record, read back, and remove", async () => {
  const s = new MemoryStorage();
  expect(await s.getBotPresence("chat-1")).toEqual({});

  await s.recordBotPresence("chat-1", "main", 1000);
  await s.recordBotPresence("chat-1", "cat", 2000);
  expect(await s.getBotPresence("chat-1")).toEqual({ main: 1000, cat: 2000 });

  // Re-recording updates the timestamp in place.
  await s.recordBotPresence("chat-1", "main", 3000);
  expect((await s.getBotPresence("chat-1")).main).toBe(3000);

  await s.removeBotPresence("chat-1", "cat");
  expect(await s.getBotPresence("chat-1")).toEqual({ main: 3000 });

  // Presence is per-chat.
  expect(await s.getBotPresence("chat-2")).toEqual({});
});

test("bot presence is a shared registry across forBot scopes", async () => {
  const base = new MemoryStorage();
  // The main bot (base scope) records its presence; a managed bot's scoped
  // view must observe it — otherwise the alone-check could never see siblings.
  await base.recordBotPresence("g", "main", 5000);

  const catView = base.forBot("cat");
  expect(await catView.getBotPresence("g")).toEqual({ main: 5000 });

  // ...and a write through the scoped view is visible to the base view.
  await catView.recordBotPresence("g", "cat", 6000);
  expect(await base.getBotPresence("g")).toEqual({ main: 5000, cat: 6000 });
});
