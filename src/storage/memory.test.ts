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

describe("MemoryStorage usage", () => {
  test("accrues to both windows, rolling a window over on a new start", async () => {
    const s = new MemoryStorage();
    // First write seeds both windows at the given starts.
    await s.addUserUsage("u1", 100, 1000, 5000);
    expect(await s.getUserUsage("u1")).toEqual({
      fiveHour: { windowStart: 1000, used: 100 },
      weekly: { windowStart: 5000, used: 100 },
    });
    // Same starts accumulate.
    await s.addUserUsage("u1", 50, 1000, 5000);
    expect((await s.getUserUsage("u1"))?.fiveHour.used).toBe(150);
    // A new 5-hour start resets that window's used; the weekly start is
    // unchanged, so it keeps accumulating.
    await s.addUserUsage("u1", 30, 2000, 5000);
    expect(await s.getUserUsage("u1")).toEqual({
      fiveHour: { windowStart: 2000, used: 30 },
      weekly: { windowStart: 5000, used: 180 },
    });
  });

  test("is per user and cleared by reset", async () => {
    const s = new MemoryStorage();
    await s.addUserUsage("u1", 100, 1000, 5000);
    expect(await s.getUserUsage("u2")).toBeNull();
    await s.resetUserUsage("u1");
    expect(await s.getUserUsage("u1")).toBeNull();
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

  test("round-trips userImageFileIds", async () => {
    const s = new MemoryStorage();
    await s.saveConversation("c1", 10, {
      userQuestion: "Q",
      botAnswer: "A",
      parentBotMsgId: null,
      ts: 1,
      userImageFileIds: ["fileA", "fileB"],
    });
    expect(await s.getConversation("c1", 10)).toEqual({
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
    await s.saveConversation("c1", 10, {
      userQuestion: "Q",
      botAnswer: "A",
      parentBotMsgId: null,
      ts: 1,
      userImageFileIds: ids,
    });
    ids.push("c");
    const got = await s.getConversation("c1", 10);
    expect(got?.userImageFileIds).toEqual(["a", "b"]);
    got!.userImageFileIds!.push("d");
    const again = await s.getConversation("c1", 10);
    expect(again?.userImageFileIds).toEqual(["a", "b"]);
  });
});

describe("MemoryStorage photo cache", () => {
  test("round-trips bytes by file_id", async () => {
    const s = new MemoryStorage();
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);
    await s.savePhotoBytes("file42", bytes);
    const got = await s.getPhotoBytes("file42");
    expect(got).toEqual(bytes);
  });

  test("returns null for unknown file_id", async () => {
    const s = new MemoryStorage();
    expect(await s.getPhotoBytes("unknown")).toBeNull();
  });

  test("returned bytes are independent of stored copy", async () => {
    const s = new MemoryStorage();
    const bytes = new Uint8Array([1, 2, 3]);
    await s.savePhotoBytes("f", bytes);
    bytes[0] = 99;
    const got = await s.getPhotoBytes("f");
    expect(got).toEqual(new Uint8Array([1, 2, 3]));
  });
});

describe("MemoryStorage album index", () => {
  test("returns empty array for unknown album", async () => {
    const s = new MemoryStorage();
    expect(await s.getAlbumPhotos("c1", "g1")).toEqual([]);
  });

  test("appends multiple photos and returns them all", async () => {
    const s = new MemoryStorage();
    await s.appendAlbumPhoto("c1", "g1", { messageId: 10, fileId: "a" });
    await s.appendAlbumPhoto("c1", "g1", { messageId: 11, fileId: "b" });
    await s.appendAlbumPhoto("c1", "g1", { messageId: 12, fileId: "c" });
    const all = await s.getAlbumPhotos("c1", "g1");
    expect(all).toHaveLength(3);
    expect(all.sort((x, y) => x.messageId - y.messageId)).toEqual([
      { messageId: 10, fileId: "a" },
      { messageId: 11, fileId: "b" },
      { messageId: 12, fileId: "c" },
    ]);
  });

  test("re-append for same message_id overwrites file_id, keeps single entry", async () => {
    const s = new MemoryStorage();
    await s.appendAlbumPhoto("c1", "g1", { messageId: 1, fileId: "old" });
    await s.appendAlbumPhoto("c1", "g1", { messageId: 1, fileId: "new" });
    expect(await s.getAlbumPhotos("c1", "g1")).toEqual([
      { messageId: 1, fileId: "new" },
    ]);
  });

  test("scopes by chat: same media_group_id in different chats is isolated", async () => {
    const s = new MemoryStorage();
    await s.appendAlbumPhoto("c1", "g", { messageId: 1, fileId: "x" });
    await s.appendAlbumPhoto("c2", "g", { messageId: 2, fileId: "y" });
    expect(await s.getAlbumPhotos("c1", "g")).toEqual([
      { messageId: 1, fileId: "x" },
    ]);
    expect(await s.getAlbumPhotos("c2", "g")).toEqual([
      { messageId: 2, fileId: "y" },
    ]);
  });
});

describe("MemoryStorage user spend", () => {
  const DAY = 86_400_000;
  const NOW = Date.UTC(2026, 4, 26, 12);

  test("returns all-zero summary for a user with no spend", async () => {
    const s = new MemoryStorage();
    expect(await s.getUserSpend("42", NOW)).toEqual({
      day: 0,
      week: 0,
      month: 0,
    });
  });

  test("accrues same-day spend and buckets into day/week/month", async () => {
    const s = new MemoryStorage();
    await s.addUserSpend("42", 0.5, NOW);
    await s.addUserSpend("42", 0.25, NOW);
    expect(await s.getUserSpend("42", NOW)).toEqual({
      day: 0.75,
      week: 0.75,
      month: 0.75,
    });
  });

  test("older spend falls out of the shorter windows", async () => {
    const s = new MemoryStorage();
    await s.addUserSpend("42", 1, NOW);
    await s.addUserSpend("42", 2, NOW - 3 * DAY);
    await s.addUserSpend("42", 4, NOW - 10 * DAY);
    expect(await s.getUserSpend("42", NOW)).toEqual({
      day: 1,
      week: 3,
      month: 7,
    });
  });

  test("ignores non-positive costs", async () => {
    const s = new MemoryStorage();
    await s.addUserSpend("42", 0, NOW);
    await s.addUserSpend("42", -5, NOW);
    expect(await s.getUserSpend("42", NOW)).toEqual({
      day: 0,
      week: 0,
      month: 0,
    });
  });

  test("scopes spend per user", async () => {
    const s = new MemoryStorage();
    await s.addUserSpend("1", 3, NOW);
    await s.addUserSpend("2", 7, NOW);
    expect((await s.getUserSpend("1", NOW)).day).toBe(3);
    expect((await s.getUserSpend("2", NOW)).day).toBe(7);
  });

  test("prunes buckets beyond the retention window", async () => {
    const s = new MemoryStorage();
    await s.addUserSpend("42", 9, NOW - 100 * DAY);
    // A later write triggers pruning of the stale bucket.
    await s.addUserSpend("42", 1, NOW);
    // Query as of the old date: the pruned bucket is gone.
    expect(await s.getUserSpend("42", NOW - 100 * DAY)).toEqual({
      day: 0,
      week: 0,
      month: 0,
    });
  });
});
