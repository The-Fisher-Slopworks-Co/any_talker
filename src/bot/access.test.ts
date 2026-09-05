// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { MemoryStorage } from "../storage/memory";
import { checkAccess } from "./access";

describe("checkAccess", () => {
  test("owner always allowed regardless of whitelist", async () => {
    const storage = new MemoryStorage();
    expect(
      await checkAccess({
        storage,
        ownerId: "1",
        userId: "1",
        chatId: "any",
        whitelistEnabled: true,
      }),
    ).toEqual({ allowed: true });
  });

  test("non-owner with whitelisted user passes in any chat", async () => {
    const storage = new MemoryStorage();
    await storage.addWhitelist("users", { id: "42" });
    expect(
      await checkAccess({
        storage,
        ownerId: "1",
        userId: "42",
        chatId: "x",
        whitelistEnabled: true,
      }),
    ).toEqual({ allowed: true });
  });

  test("non-owner in whitelisted chat passes", async () => {
    const storage = new MemoryStorage();
    await storage.addWhitelist("chats", { id: "-100" });
    expect(
      await checkAccess({
        storage,
        ownerId: "1",
        userId: "42",
        chatId: "-100",
        whitelistEnabled: true,
      }),
    ).toEqual({ allowed: true });
  });

  test("neither user nor chat whitelisted: denied as not_whitelisted", async () => {
    const storage = new MemoryStorage();
    expect(
      await checkAccess({
        storage,
        ownerId: "1",
        userId: "42",
        chatId: "x",
        whitelistEnabled: true,
      }),
    ).toEqual({ allowed: false, reason: "not_whitelisted" });
  });

  test("whitelist disabled: non-whitelisted non-owner is allowed", async () => {
    const storage = new MemoryStorage();
    expect(
      await checkAccess({
        storage,
        ownerId: "1",
        userId: "42",
        chatId: "x",
        whitelistEnabled: false,
      }),
    ).toEqual({ allowed: true });
  });

  test("whitelist disabled: still short-circuits for the owner", async () => {
    const storage = new MemoryStorage();
    expect(
      await checkAccess({
        storage,
        ownerId: "1",
        userId: "1",
        chatId: "any",
        whitelistEnabled: false,
      }),
    ).toEqual({ allowed: true });
  });

  test("blacklisted user denied even with whitelist disabled", async () => {
    const storage = new MemoryStorage();
    await storage.addBlacklist("users", { id: "42" });
    expect(
      await checkAccess({
        storage,
        ownerId: "1",
        userId: "42",
        chatId: "x",
        whitelistEnabled: false,
      }),
    ).toEqual({ allowed: false, reason: "blacklisted" });
  });

  test("blacklist wins over the user's own whitelist entry", async () => {
    const storage = new MemoryStorage();
    await storage.addWhitelist("users", { id: "42" });
    await storage.addBlacklist("users", { id: "42" });
    expect(
      await checkAccess({
        storage,
        ownerId: "1",
        userId: "42",
        chatId: "x",
        whitelistEnabled: true,
      }),
    ).toEqual({ allowed: false, reason: "blacklisted" });
  });

  test("blacklist wins over a whitelisted chat", async () => {
    const storage = new MemoryStorage();
    await storage.addWhitelist("chats", { id: "-100" });
    await storage.addBlacklist("users", { id: "42" });
    expect(
      await checkAccess({
        storage,
        ownerId: "1",
        userId: "42",
        chatId: "-100",
        whitelistEnabled: true,
      }),
    ).toEqual({ allowed: false, reason: "blacklisted" });
  });

  test("a blacklist entry for the owner's id has no effect", async () => {
    const storage = new MemoryStorage();
    await storage.addBlacklist("users", { id: "1" });
    expect(
      await checkAccess({
        storage,
        ownerId: "1",
        userId: "1",
        chatId: "any",
        whitelistEnabled: true,
      }),
    ).toEqual({ allowed: true });
  });

  test("blacklisted chat denies its users even with whitelist disabled", async () => {
    const storage = new MemoryStorage();
    await storage.addBlacklist("chats", { id: "-100" });
    expect(
      await checkAccess({
        storage,
        ownerId: "1",
        userId: "42",
        chatId: "-100",
        whitelistEnabled: false,
      }),
    ).toEqual({ allowed: false, reason: "blacklisted" });
  });

  test("a blacklisted chat wins over the user's own whitelist entry", async () => {
    const storage = new MemoryStorage();
    await storage.addWhitelist("users", { id: "42" });
    await storage.addWhitelist("chats", { id: "-100" });
    await storage.addBlacklist("chats", { id: "-100" });
    expect(
      await checkAccess({
        storage,
        ownerId: "1",
        userId: "42",
        chatId: "-100",
        whitelistEnabled: true,
      }),
    ).toEqual({ allowed: false, reason: "blacklisted" });
  });

  test("a blacklisted chat does not block the same user elsewhere", async () => {
    const storage = new MemoryStorage();
    await storage.addBlacklist("chats", { id: "-100" });
    expect(
      await checkAccess({
        storage,
        ownerId: "1",
        userId: "42",
        chatId: "-200",
        whitelistEnabled: false,
      }),
    ).toEqual({ allowed: true });
  });

  test("the owner is immune to a blacklisted chat too", async () => {
    const storage = new MemoryStorage();
    await storage.addBlacklist("chats", { id: "-100" });
    expect(
      await checkAccess({
        storage,
        ownerId: "1",
        userId: "1",
        chatId: "-100",
        whitelistEnabled: true,
      }),
    ).toEqual({ allowed: true });
  });
});

// A message sent on behalf of a chat (an anonymous group admin, or a channel
// commenting under its own post) is identified by the sending chat — see
// `bot/identity.ts`. The gate reads it off the chat lists, which is where the
// admin UI files a chat.
describe("checkAccess for a message sent as a chat", () => {
  test("a blacklisted sending channel is denied, wherever it posts", async () => {
    const storage = new MemoryStorage();
    await storage.addBlacklist("chats", { id: "-1001" });
    await storage.addWhitelist("chats", { id: "-500" });
    expect(
      await checkAccess({
        storage,
        ownerId: "1",
        userId: "-1001",
        chatId: "-500",
        senderChatId: "-1001",
        whitelistEnabled: true,
      }),
    ).toEqual({ allowed: false, reason: "blacklisted" });
  });

  test("blocking one channel does not block another posting in the same chat", async () => {
    const storage = new MemoryStorage();
    await storage.addBlacklist("chats", { id: "-1001" });
    expect(
      await checkAccess({
        storage,
        ownerId: "1",
        userId: "-2002",
        chatId: "-500",
        senderChatId: "-2002",
        whitelistEnabled: false,
      }),
    ).toEqual({ allowed: true });
  });

  test("whitelisting the sending channel grants it access", async () => {
    const storage = new MemoryStorage();
    await storage.addWhitelist("chats", { id: "-1001" });
    expect(
      await checkAccess({
        storage,
        ownerId: "1",
        userId: "-1001",
        chatId: "-500",
        senderChatId: "-1001",
        whitelistEnabled: true,
      }),
    ).toEqual({ allowed: true });
  });

  test("a whitelist entry for a DIFFERENT channel does not carry over", async () => {
    const storage = new MemoryStorage();
    await storage.addWhitelist("chats", { id: "-1001" });
    expect(
      await checkAccess({
        storage,
        ownerId: "1",
        userId: "-2002",
        chatId: "-500",
        senderChatId: "-2002",
        whitelistEnabled: true,
      }),
    ).toEqual({ allowed: false, reason: "not_whitelisted" });
  });

  // The owner posting as their own channel is a stranger to the gate: nothing
  // links a channel to the human behind it. Documented limitation — the way
  // back in is whitelisting the channel (the test above).
  test("the owner posting as their channel does NOT inherit owner immunity", async () => {
    const storage = new MemoryStorage();
    expect(
      await checkAccess({
        storage,
        ownerId: "1",
        userId: "-1001",
        chatId: "-500",
        senderChatId: "-1001",
        whitelistEnabled: true,
      }),
    ).toEqual({ allowed: false, reason: "not_whitelisted" });
  });
});
