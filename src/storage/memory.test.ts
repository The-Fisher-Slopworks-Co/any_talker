// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { MemoryStorage } from "./memory";
import { DEFAULT_SETTINGS } from "../shared/types";

describe("MemoryStorage settings", () => {
  test("returns null when not set", async () => {
    const s = new MemoryStorage();
    expect(await s.settings.get()).toBeNull();
  });

  test("round-trips a saved value", async () => {
    const s = new MemoryStorage();
    await s.settings.save(DEFAULT_SETTINGS);
    expect(await s.settings.get()).toEqual(DEFAULT_SETTINGS);
  });
});

describe("MemoryStorage whitelist", () => {
  test("starts empty", async () => {
    const s = new MemoryStorage();
    expect(await s.access.listWhitelist("users")).toEqual([]);
    expect(await s.access.isWhitelisted("users", "1")).toBe(false);
  });

  test("add then list and check", async () => {
    const s = new MemoryStorage();
    await s.access.addWhitelist("users", { id: "42", label: "alice" });
    await s.access.addWhitelist("chats", { id: "-100", label: "team" });
    expect(await s.access.listWhitelist("users")).toEqual([
      { id: "42", label: "alice" },
    ]);
    expect(await s.access.isWhitelisted("users", "42")).toBe(true);
    expect(await s.access.isWhitelisted("chats", "-100")).toBe(true);
    expect(await s.access.isWhitelisted("users", "-100")).toBe(false);
  });

  test("add is idempotent on id, last label wins", async () => {
    const s = new MemoryStorage();
    await s.access.addWhitelist("users", { id: "42", label: "a" });
    await s.access.addWhitelist("users", { id: "42", label: "b" });
    expect(await s.access.listWhitelist("users")).toEqual([
      { id: "42", label: "b" },
    ]);
  });

  test("remove removes the entry", async () => {
    const s = new MemoryStorage();
    await s.access.addWhitelist("users", { id: "42" });
    await s.access.removeWhitelist("users", "42");
    expect(await s.access.isWhitelisted("users", "42")).toBe(false);
  });
});

describe("MemoryStorage blacklist", () => {
  test("starts empty", async () => {
    const s = new MemoryStorage();
    expect(await s.access.listBlacklist("users")).toEqual([]);
    expect(await s.access.listBlacklist("chats")).toEqual([]);
    expect(await s.access.isBlacklisted("users", "1")).toBe(false);
    expect(await s.access.isBlacklisted("chats", "1")).toBe(false);
  });

  test("add then list and check; add is idempotent on id, last label wins", async () => {
    const s = new MemoryStorage();
    await s.access.addBlacklist("users", { id: "42", label: "a" });
    await s.access.addBlacklist("users", { id: "42", label: "b" });
    expect(await s.access.listBlacklist("users")).toEqual([
      { id: "42", label: "b" },
    ]);
    expect(await s.access.isBlacklisted("users", "42")).toBe(true);
    expect(await s.access.isBlacklisted("users", "43")).toBe(false);
  });

  test("remove removes the entry", async () => {
    const s = new MemoryStorage();
    await s.access.addBlacklist("users", { id: "42" });
    await s.access.removeBlacklist("users", "42");
    expect(await s.access.isBlacklisted("users", "42")).toBe(false);
  });

  test("users and chats are separate lists", async () => {
    const s = new MemoryStorage();
    await s.access.addBlacklist("chats", { id: "-100" });
    expect(await s.access.isBlacklisted("chats", "-100")).toBe(true);
    expect(await s.access.isBlacklisted("users", "-100")).toBe(false);
    expect(await s.access.listBlacklist("users")).toEqual([]);
  });

  test("is shared across forBot scopes (global, like the whitelist)", async () => {
    const s = new MemoryStorage();
    await s.forBot("777").access.addBlacklist("users", { id: "42" });
    expect(await s.access.isBlacklisted("users", "42")).toBe(true);
    expect(await s.forBot(null).access.isBlacklisted("users", "42")).toBe(true);
  });
});

describe("MemoryStorage usage", () => {
  test("accrues to both windows, rolling a window over on a new start", async () => {
    const s = new MemoryStorage();
    // First write seeds both windows at the given starts.
    await s.usage.add("u1", 100, 1000, 5000);
    expect(await s.usage.get("u1")).toEqual({
      fiveHour: { windowStart: 1000, used: 100 },
      weekly: { windowStart: 5000, used: 100 },
    });
    // Same starts accumulate.
    await s.usage.add("u1", 50, 1000, 5000);
    expect((await s.usage.get("u1"))?.fiveHour.used).toBe(150);
    // A new 5-hour start resets that window's used; the weekly start is
    // unchanged, so it keeps accumulating.
    await s.usage.add("u1", 30, 2000, 5000);
    expect(await s.usage.get("u1")).toEqual({
      fiveHour: { windowStart: 2000, used: 30 },
      weekly: { windowStart: 5000, used: 180 },
    });
  });

  test("is per user and cleared by reset", async () => {
    const s = new MemoryStorage();
    await s.usage.add("u1", 100, 1000, 5000);
    expect(await s.usage.get("u2")).toBeNull();
    await s.usage.reset("u1");
    expect(await s.usage.get("u1")).toBeNull();
  });
});

describe("MemoryStorage conversation", () => {
  test("round-trips by (chatId, botMsgId)", async () => {
    const s = new MemoryStorage();
    await s.conversations.save("c1", 10, {
      userQuestion: "Q",
      botAnswer: "A",
      parentBotMsgId: null,
      ts: 1,
    });
    expect(await s.conversations.get("c1", 10)).toEqual({
      userQuestion: "Q",
      botAnswer: "A",
      parentBotMsgId: null,
      ts: 1,
    });
    expect(await s.conversations.get("c1", 11)).toBeNull();
    expect(await s.conversations.get("c2", 10)).toBeNull();
  });

  test("round-trips userImageFileIds", async () => {
    const s = new MemoryStorage();
    await s.conversations.save("c1", 10, {
      userQuestion: "Q",
      botAnswer: "A",
      parentBotMsgId: null,
      ts: 1,
      userImageFileIds: ["fileA", "fileB"],
    });
    expect(await s.conversations.get("c1", 10)).toEqual({
      userQuestion: "Q",
      botAnswer: "A",
      parentBotMsgId: null,
      ts: 1,
      userImageFileIds: ["fileA", "fileB"],
    });
  });

  test("returned userImageFileIds array is independent of stored copy", async () => {
    const s = new MemoryStorage();
    const ids = ["a", "b"];
    await s.conversations.save("c1", 10, {
      userQuestion: "Q",
      botAnswer: "A",
      parentBotMsgId: null,
      ts: 1,
      userImageFileIds: ids,
    });
    ids.push("c");
    const got = await s.conversations.get("c1", 10);
    expect(got?.userImageFileIds).toEqual(["a", "b"]);
    got!.userImageFileIds!.push("d");
    const again = await s.conversations.get("c1", 10);
    expect(again?.userImageFileIds).toEqual(["a", "b"]);
  });

  test("round-trips the turn's run", async () => {
    const s = new MemoryStorage();
    const run = {
      gen: ["gen-1789064867-b8Jgaf"],
      model: "anthropic/claude-sonnet-4.5",
      detail: "wise" as const,
      instr: "d1e181d3faa2c130",
    };
    await s.conversations.save("c1", 10, {
      userQuestion: "Q",
      botAnswer: "A",
      parentBotMsgId: null,
      ts: 1,
      run,
    });
    expect((await s.conversations.get("c1", 10))?.run).toEqual(run);
  });

  // As with userImageFileIds: KeyDB round-trips through JSON, so the in-memory
  // store has to copy what KeyDB copies for free.
  test("returned run.gen array is independent of the stored copy", async () => {
    const s = new MemoryStorage();
    const gen = ["gen-a"];
    await s.conversations.save("c1", 10, {
      userQuestion: "Q",
      botAnswer: "A",
      parentBotMsgId: null,
      ts: 1,
      run: { gen, instr: "d1e181d3faa2c130" },
    });
    gen.push("gen-b");
    const got = await s.conversations.get("c1", 10);
    expect(got?.run?.gen).toEqual(["gen-a"]);
    got!.run!.gen.push("gen-c");
    expect((await s.conversations.get("c1", 10))?.run?.gen).toEqual(["gen-a"]);
  });
});

describe("MemoryStorage photo cache", () => {
  test("round-trips bytes by file_id", async () => {
    const s = new MemoryStorage();
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);
    await s.photos.saveBytes("file42", bytes);
    const got = await s.photos.getBytes("file42");
    expect(got).toEqual(bytes);
  });

  test("returns null for unknown file_id", async () => {
    const s = new MemoryStorage();
    expect(await s.photos.getBytes("unknown")).toBeNull();
  });

  test("returned bytes are independent of stored copy", async () => {
    const s = new MemoryStorage();
    const bytes = new Uint8Array([1, 2, 3]);
    await s.photos.saveBytes("f", bytes);
    bytes[0] = 99;
    const got = await s.photos.getBytes("f");
    expect(got).toEqual(new Uint8Array([1, 2, 3]));
  });
});

describe("MemoryStorage album index", () => {
  test("returns empty array for unknown album", async () => {
    const s = new MemoryStorage();
    expect(await s.photos.listAlbum("c1", "g1")).toEqual([]);
  });

  test("appends multiple photos and returns them all", async () => {
    const s = new MemoryStorage();
    await s.photos.appendAlbum("c1", "g1", { messageId: 10, fileId: "a" });
    await s.photos.appendAlbum("c1", "g1", { messageId: 11, fileId: "b" });
    await s.photos.appendAlbum("c1", "g1", { messageId: 12, fileId: "c" });
    const all = await s.photos.listAlbum("c1", "g1");
    expect(all).toHaveLength(3);
    expect(all.sort((x, y) => x.messageId - y.messageId)).toEqual([
      { messageId: 10, fileId: "a" },
      { messageId: 11, fileId: "b" },
      { messageId: 12, fileId: "c" },
    ]);
  });

  test("re-append for same message_id overwrites file_id, keeps single entry", async () => {
    const s = new MemoryStorage();
    await s.photos.appendAlbum("c1", "g1", { messageId: 1, fileId: "old" });
    await s.photos.appendAlbum("c1", "g1", { messageId: 1, fileId: "new" });
    expect(await s.photos.listAlbum("c1", "g1")).toEqual([
      { messageId: 1, fileId: "new" },
    ]);
  });

  test("scopes by chat: same media_group_id in different chats is isolated", async () => {
    const s = new MemoryStorage();
    await s.photos.appendAlbum("c1", "g", { messageId: 1, fileId: "x" });
    await s.photos.appendAlbum("c2", "g", { messageId: 2, fileId: "y" });
    expect(await s.photos.listAlbum("c1", "g")).toEqual([
      { messageId: 1, fileId: "x" },
    ]);
    expect(await s.photos.listAlbum("c2", "g")).toEqual([
      { messageId: 2, fileId: "y" },
    ]);
  });
});

describe("MemoryStorage user spend", () => {
  const DAY = 86_400_000;
  const NOW = Date.UTC(2026, 4, 26, 12);

  test("returns all-zero summary for a user with no spend", async () => {
    const s = new MemoryStorage();
    expect(await s.spend.getUser("42", NOW)).toEqual({
      day: 0,
      week: 0,
      month: 0,
    });
  });

  test("accrues same-day spend and buckets into day/week/month", async () => {
    const s = new MemoryStorage();
    await s.spend.addUser("42", 0.5, NOW);
    await s.spend.addUser("42", 0.25, NOW);
    expect(await s.spend.getUser("42", NOW)).toEqual({
      day: 0.75,
      week: 0.75,
      month: 0.75,
    });
  });

  test("older spend falls out of the shorter windows", async () => {
    const s = new MemoryStorage();
    await s.spend.addUser("42", 1, NOW);
    await s.spend.addUser("42", 2, NOW - 3 * DAY);
    await s.spend.addUser("42", 4, NOW - 10 * DAY);
    expect(await s.spend.getUser("42", NOW)).toEqual({
      day: 1,
      week: 3,
      month: 7,
    });
  });

  test("ignores non-positive costs", async () => {
    const s = new MemoryStorage();
    await s.spend.addUser("42", 0, NOW);
    await s.spend.addUser("42", -5, NOW);
    expect(await s.spend.getUser("42", NOW)).toEqual({
      day: 0,
      week: 0,
      month: 0,
    });
  });

  test("scopes spend per user", async () => {
    const s = new MemoryStorage();
    await s.spend.addUser("1", 3, NOW);
    await s.spend.addUser("2", 7, NOW);
    expect((await s.spend.getUser("1", NOW)).day).toBe(3);
    expect((await s.spend.getUser("2", NOW)).day).toBe(7);
  });

  test("prunes buckets beyond the retention window", async () => {
    const s = new MemoryStorage();
    await s.spend.addUser("42", 9, NOW - 100 * DAY);
    // A later write triggers pruning of the stale bucket.
    await s.spend.addUser("42", 1, NOW);
    // Query as of the old date: the pruned bucket is gone.
    expect(await s.spend.getUser("42", NOW - 100 * DAY)).toEqual({
      day: 0,
      week: 0,
      month: 0,
    });
  });
});
