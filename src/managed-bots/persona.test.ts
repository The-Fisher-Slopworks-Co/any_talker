// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect } from "bun:test";
import { MemoryStorage } from "../storage/memory";
import {
  createMainPersonaResolver,
  createManagedPersonaResolver,
} from "./persona";
import { DEFAULT_SETTINGS } from "../shared/types";
import type { ManagedBot } from "./types";

const bot: ManagedBot = {
  botId: "cat",
  ownerUserId: "1",
  username: "CatBot",
  displayName: "Кошечка",
  systemPrompt: "cat prompt",
  createdAtMs: 0,
};

test("managed resolver: global settings + character prompt/name, ignoring per-chat overrides", async () => {
  const storage = new MemoryStorage();
  await storage.saveSettings({
    ...DEFAULT_SETTINGS,
    systemPrompt: "global prompt",
    models: ["m-global"],
  });
  // A per-chat override configured on the main bot must NOT bleed into a
  // managed bot — that is the confirmed inheritance rule (global only).
  await storage.saveChatSettings("chat-1", {
    systemPrompt: "chat override",
    models: ["m-chat"],
    botName: "ChatName",
  });
  await storage.saveManagedBot(bot);

  const { settings, botName } = await createManagedPersonaResolver(
    storage,
    "cat",
  )("chat-1");

  expect(settings.systemPrompt).toBe("cat prompt"); // from the record
  expect(settings.models).toEqual(["m-global"]); // global, not the chat override
  expect(botName).toBe("Кошечка");
});

test("managed resolver: falls back to global settings if the record vanished", async () => {
  const storage = new MemoryStorage();
  await storage.saveSettings({ ...DEFAULT_SETTINGS, systemPrompt: "global prompt" });

  const { settings, botName } = await createManagedPersonaResolver(
    storage,
    "ghost",
  )("chat-1");

  expect(settings.systemPrompt).toBe("global prompt");
  expect(botName).toBeNull();
});

test("main resolver: effective settings (global + chat override) + chat botName", async () => {
  const storage = new MemoryStorage();
  await storage.saveSettings({
    ...DEFAULT_SETTINGS,
    systemPrompt: "global prompt",
    models: ["m-global"],
  });
  await storage.saveChatSettings("chat-1", {
    systemPrompt: "chat override",
    botName: "ChatName",
  });

  const { settings, botName } = await createMainPersonaResolver(storage)(
    "chat-1",
  );

  expect(settings.systemPrompt).toBe("chat override");
  expect(botName).toBe("ChatName");
});
