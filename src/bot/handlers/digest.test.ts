// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { MemoryStorage } from "../../storage/memory";
import { digestCommandHandler, matchDigestCommand } from "./digest";

const NOW = 1_700_000_000_000;
const HOUR = 60 * 60 * 1000;

const run = (
  storage: MemoryStorage,
  over: Partial<Parameters<typeof digestCommandHandler>[0]> = {},
) =>
  digestCommandHandler({
    storage,
    ownerId: "owner",
    isPrivateChat: true,
    fromUserId: "owner",
    lang: "en",
    nowMs: NOW,
    ...over,
  });

describe("matchDigestCommand", () => {
  test("matches the bare command and this bot's mention", () => {
    expect(matchDigestCommand("/digest", "mybot")).toBe(true);
    expect(matchDigestCommand("  /digest  ", "mybot")).toBe(true);
    expect(matchDigestCommand("/DIGEST", "mybot")).toBe(true);
    expect(matchDigestCommand("/digest@mybot", "mybot")).toBe(true);
  });

  test("ignores another bot's command and anything with arguments", () => {
    expect(matchDigestCommand("/digest@otherbot", "mybot")).toBe(false);
    expect(matchDigestCommand("/digest please", "mybot")).toBe(false);
    expect(matchDigestCommand("/digesting", "mybot")).toBe(false);
    expect(matchDigestCommand("tell me /digest", "mybot")).toBe(false);
  });
});

describe("digestCommandHandler", () => {
  test("ignores non-owners and group chats", async () => {
    const storage = new MemoryStorage();
    await storage.spend.addGlobal(1, NOW);

    expect(await run(storage, { fromUserId: "someone" })).toEqual({
      kind: "ignored",
    });
    expect(await run(storage, { isPrivateChat: false })).toEqual({
      kind: "ignored",
    });
  });

  test("returns the digest markdown for the owner", async () => {
    const storage = new MemoryStorage();
    await storage.spend.addGlobal(0.004321, NOW);
    await storage.spend.addUser("u1", 0.004321, NOW);
    await storage.users.upsert({
      id: "u1",
      firstName: "A",
      lastName: null,
      username: "spender",
      firstSeenAt: 1,
      lastSeenAt: NOW,
    });

    const outcome = await run(storage);
    expect(outcome.kind).toBe("digest");
    if (outcome.kind !== "digest") return;
    expect(outcome.markdown).toContain("| User | 30d | 7d | Today |");
    expect(outcome.markdown).toContain("@spender");
  });

  test("reports emptiness rather than staying silent", async () => {
    const storage = new MemoryStorage();
    expect(await run(storage)).toEqual({ kind: "empty" });
  });

  test("leaves the scheduler's cadence untouched", async () => {
    const storage = new MemoryStorage();
    await storage.spend.addGlobal(1, NOW);
    await storage.observability.setDigestState({
      lastSentAtMs: NOW - 5 * HOUR,
    });

    await run(storage);

    expect(await storage.observability.getDigestState()).toEqual({
      lastSentAtMs: NOW - 5 * HOUR,
    });
  });

  test("counts 'new' from the last scheduled digest", async () => {
    const storage = new MemoryStorage();
    await storage.spend.addGlobal(1, NOW);
    await storage.observability.setDigestState({
      lastSentAtMs: NOW - 2 * HOUR,
    });
    // Seen before that mark, so not new; and one seen after, which is.
    await storage.users.upsert({
      id: "old",
      firstName: "Old",
      lastName: null,
      username: "oldtimer",
      firstSeenAt: NOW - 10 * HOUR,
      lastSeenAt: NOW,
    });
    await storage.users.upsert({
      id: "fresh",
      firstName: "Fresh",
      lastName: null,
      username: "newcomer",
      firstSeenAt: NOW - HOUR,
      lastSeenAt: NOW,
    });

    const outcome = await run(storage);
    if (outcome.kind !== "digest") throw new Error("expected a digest");
    expect(outcome.markdown).toContain("New users: 1");
    expect(outcome.markdown).toContain("@newcomer");
    expect(outcome.markdown).not.toContain("@oldtimer");
  });

  test("excludes private chats from the chat table, as the scheduled digest does", async () => {
    const storage = new MemoryStorage();
    await storage.spend.addGlobal(5.5, NOW);
    await storage.chats.upsert({
      id: "-100",
      type: "supergroup",
      title: "The group",
      username: null,
      firstSeenAt: 1,
      lastSeenAt: NOW,
    });
    await storage.chats.upsert({
      id: "42",
      type: "private",
      title: null,
      username: "solo",
      firstSeenAt: 1,
      lastSeenAt: NOW,
    });
    await storage.spend.addChat("-100", 0.5, NOW);
    await storage.spend.addChat("42", 5, NOW);

    const outcome = await run(storage);
    if (outcome.kind !== "digest") throw new Error("expected a digest");
    expect(outcome.markdown).toContain("The group");
    expect(outcome.markdown).not.toContain("@solo");
  });
});
