// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { MemoryStorage } from "../../storage/memory";
import {
  matchResetUsageCommand,
  resetUsageCommandHandler,
} from "./reset-usage";

async function withUsage(...userIds: string[]): Promise<MemoryStorage> {
  const storage = new MemoryStorage();
  for (const id of userIds) await storage.usage.add(id, 500, 0, 0);
  return storage;
}

describe("matchResetUsageCommand", () => {
  test("matches the bare command and the one addressed to this bot", () => {
    expect(matchResetUsageCommand("/resetusage", "my_bot")).toEqual({
      explicit: false,
    });
    expect(matchResetUsageCommand("/ResetUsage@My_Bot ", "my_bot")).toEqual({
      explicit: true,
    });
  });

  test("ignores another bot's command, arguments and lookalikes", () => {
    expect(
      matchResetUsageCommand("/resetusage@other_bot", "my_bot"),
    ).toBeNull();
    expect(matchResetUsageCommand("/resetusage now", "my_bot")).toBeNull();
    expect(matchResetUsageCommand("/usage", "my_bot")).toBeNull();
  });
});

describe("resetUsageCommandHandler", () => {
  test("the owner clears every user's usage", async () => {
    const storage = await withUsage("u1", "u2", "u3");
    const outcome = await resetUsageCommandHandler({
      storage,
      ownerId: "owner",
      fromUserId: "owner",
    });
    expect(outcome).toEqual({ kind: "reset", users: 3 });
    for (const id of ["u1", "u2", "u3"]) {
      expect(await storage.usage.get(id)).toBeNull();
    }
  });

  test("anyone else is ignored and nothing is cleared", async () => {
    const storage = await withUsage("u1", "u2");
    const outcome = await resetUsageCommandHandler({
      storage,
      ownerId: "owner",
      fromUserId: "u1",
    });
    expect(outcome).toEqual({ kind: "ignored" });
    expect(await storage.usage.get("u1")).not.toBeNull();
    expect(await storage.usage.get("u2")).not.toBeNull();
  });
});
