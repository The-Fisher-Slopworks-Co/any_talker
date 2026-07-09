// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { MemoryStorage } from "../storage/memory";
import { isAllowed } from "./access";

describe("isAllowed", () => {
  test("owner always allowed regardless of whitelist", async () => {
    const storage = new MemoryStorage();
    expect(
      await isAllowed({
        storage,
        ownerId: "1",
        userId: "1",
        chatId: "any",
        whitelistEnabled: true,
      }),
    ).toBe(true);
  });

  test("non-owner with whitelisted user passes in any chat", async () => {
    const storage = new MemoryStorage();
    await storage.addWhitelist("users", { id: "42" });
    expect(
      await isAllowed({
        storage,
        ownerId: "1",
        userId: "42",
        chatId: "x",
        whitelistEnabled: true,
      }),
    ).toBe(true);
  });

  test("non-owner in whitelisted chat passes", async () => {
    const storage = new MemoryStorage();
    await storage.addWhitelist("chats", { id: "-100" });
    expect(
      await isAllowed({
        storage,
        ownerId: "1",
        userId: "42",
        chatId: "-100",
        whitelistEnabled: true,
      }),
    ).toBe(true);
  });

  test("neither user nor chat whitelisted: denied", async () => {
    const storage = new MemoryStorage();
    expect(
      await isAllowed({
        storage,
        ownerId: "1",
        userId: "42",
        chatId: "x",
        whitelistEnabled: true,
      }),
    ).toBe(false);
  });

  test("whitelist disabled: non-whitelisted non-owner is allowed", async () => {
    const storage = new MemoryStorage();
    expect(
      await isAllowed({
        storage,
        ownerId: "1",
        userId: "42",
        chatId: "x",
        whitelistEnabled: false,
      }),
    ).toBe(true);
  });

  test("whitelist disabled: still short-circuits for the owner", async () => {
    const storage = new MemoryStorage();
    expect(
      await isAllowed({
        storage,
        ownerId: "1",
        userId: "1",
        chatId: "any",
        whitelistEnabled: false,
      }),
    ).toBe(true);
  });
});
