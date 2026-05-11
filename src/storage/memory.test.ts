// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { MemoryStorage } from "./memory";
import { DEFAULT_SETTINGS } from "../shared/types";

describe("MemoryStorage settings", () => {
  test("returns null when not set", async () => {
    const s = new MemoryStorage();
    expect(await s.getSettings()).toBeNull();
  });

  test("round-trips a saved value", async () => {
    const s = new MemoryStorage();
    await s.saveSettings(DEFAULT_SETTINGS);
    expect(await s.getSettings()).toEqual(DEFAULT_SETTINGS);
  });
});

describe("MemoryStorage whitelist", () => {
  test("starts empty", async () => {
    const s = new MemoryStorage();
    expect(await s.listWhitelist("users")).toEqual([]);
    expect(await s.isWhitelisted("users", "1")).toBe(false);
  });

  test("add then list and check", async () => {
    const s = new MemoryStorage();
    await s.addWhitelist("users", { id: "42", label: "alice" });
    await s.addWhitelist("chats", { id: "-100", label: "team" });
    expect(await s.listWhitelist("users")).toEqual([{ id: "42", label: "alice" }]);
    expect(await s.isWhitelisted("users", "42")).toBe(true);
    expect(await s.isWhitelisted("chats", "-100")).toBe(true);
    expect(await s.isWhitelisted("users", "-100")).toBe(false);
  });

  test("add is idempotent on id, last label wins", async () => {
    const s = new MemoryStorage();
    await s.addWhitelist("users", { id: "42", label: "a" });
    await s.addWhitelist("users", { id: "42", label: "b" });
    expect(await s.listWhitelist("users")).toEqual([{ id: "42", label: "b" }]);
  });

  test("remove removes the entry", async () => {
    const s = new MemoryStorage();
    await s.addWhitelist("users", { id: "42" });
    await s.removeWhitelist("users", "42");
    expect(await s.isWhitelisted("users", "42")).toBe(false);
  });
});

describe("MemoryStorage bucket", () => {
  test("round-trips per (chat, user)", async () => {
    const s = new MemoryStorage();
    await s.saveBucket("c1", "u1", { tokens: 100, lastRefillTs: 12345 });
    expect(await s.getBucket("c1", "u1")).toEqual({ tokens: 100, lastRefillTs: 12345 });
    expect(await s.getBucket("c2", "u1")).toBeNull();
    expect(await s.getBucket("c1", "u2")).toBeNull();
  });
});

describe("MemoryStorage conversation", () => {
  test("round-trips by (chatId, botMsgId)", async () => {
    const s = new MemoryStorage();
    await s.saveConversation("c1", 10, {
      userQuestion: "Q",
      botAnswer: "A",
      parentBotMsgId: null,
      ts: 1,
    });
    expect(await s.getConversation("c1", 10)).toEqual({
      userQuestion: "Q",
      botAnswer: "A",
      parentBotMsgId: null,
      ts: 1,
    });
    expect(await s.getConversation("c1", 11)).toBeNull();
    expect(await s.getConversation("c2", 10)).toBeNull();
  });
});
