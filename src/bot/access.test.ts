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
    await storage.addBlacklist({ id: "42" });
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
    await storage.addBlacklist({ id: "42" });
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
    await storage.addBlacklist({ id: "42" });
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
    await storage.addBlacklist({ id: "1" });
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
});
