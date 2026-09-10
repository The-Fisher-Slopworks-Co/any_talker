// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import type { RedisClient } from "bun";
import { MemoryStorage } from "./memory";
import { KeyDBConversationsStore } from "./keydb/conversations";
import type { ConversationsStore } from "./types/conversations";
import {
  CONVERSATION_TTL_SECONDS,
  USER_THREAD_INDEX_MAX,
} from "../shared/types";

// Redis rank ranges: inclusive on both ends, negatives counted from the end,
// an empty result when the normalized stop falls before the start.
function rankSlice(members: string[], start: number, stop: number): string[] {
  const from = start < 0 ? Math.max(members.length + start, 0) : start;
  const to =
    stop < 0 ? members.length + stop : Math.min(stop, members.length - 1);
  return to < from ? [] : members.slice(from, to + 1);
}

// A KeyDB stand-in covering exactly the commands the thread index issues.
// Sorted-set order is reproduced faithfully — by score ascending, ties broken
// by member lexicographically — because both the cap (a rank range) and the
// listing (a reverse rank range) are read off that order.
class FakeRedis {
  readonly zsets = new Map<string, Map<string, number>>();
  readonly ttls = new Map<string, number>();

  private zset(key: string): Map<string, number> {
    let z = this.zsets.get(key);
    if (!z) {
      z = new Map();
      this.zsets.set(key, z);
    }
    return z;
  }

  private ascending(key: string): string[] {
    return [...this.zset(key).entries()]
      .sort(([am, as_], [bm, bs]) =>
        as_ !== bs ? as_ - bs : am < bm ? -1 : am > bm ? 1 : 0,
      )
      .map(([member]) => member);
  }

  async zadd(key: string, score: number, member: string): Promise<number> {
    const z = this.zset(key);
    const added = z.has(member) ? 0 : 1;
    z.set(member, score);
    return added;
  }

  async zrem(key: string, ...members: string[]): Promise<number> {
    const z = this.zset(key);
    let removed = 0;
    for (const member of members) if (z.delete(member)) removed++;
    return removed;
  }

  async zrevrange(key: string, start: number, stop: number): Promise<string[]> {
    return rankSlice(this.ascending(key).toReversed(), start, stop);
  }

  async zremrangebyrank(
    key: string,
    start: number,
    stop: number,
  ): Promise<number> {
    const doomed = rankSlice(this.ascending(key), start, stop);
    return this.zrem(key, ...doomed);
  }

  async expire(key: string, seconds: number): Promise<number> {
    this.ttls.set(key, seconds);
    return 1;
  }
}

const chain = (
  botMsgId: number,
  parentBotMsgId: number | null,
  ts: number,
) => ({
  kind: "chain" as const,
  chatId: "-100",
  botId: null,
  botMsgId,
  parentBotMsgId,
  ts,
});

// The same behaviour is asserted against both implementations: a snapshot built
// from the index must not depend on which storage the bot happens to run on.
const implementations: Array<[string, () => ConversationsStore]> = [
  ["MemoryConversationsStore", () => new MemoryStorage().conversations],
  [
    "KeyDBConversationsStore",
    () =>
      new KeyDBConversationsStore(
        new FakeRedis() as unknown as RedisClient,
        (base) => `at:${base}`,
      ),
  ],
];

for (const [name, create] of implementations) {
  describe(`${name} user thread index`, () => {
    test("an unknown user has no threads", async () => {
      expect(await create().listUserThreads("42")).toEqual([]);
    });

    test("a fresh thread becomes an entry at its own head", async () => {
      const store = create();
      await store.indexUserThread("42", chain(10, null, 1_000));
      expect(await store.listUserThreads("42")).toEqual([
        { kind: "chain", chatId: "-100", botId: null, botMsgId: 10, ts: 1_000 },
      ]);
    });

    test("a follow-up advances the head instead of adding a second entry", async () => {
      const store = create();
      await store.indexUserThread("42", chain(10, null, 1_000));
      // The user replied to the bot's message 10, so the new turn hangs off it.
      await store.indexUserThread("42", chain(20, 10, 2_000));
      expect(await store.listUserThreads("42")).toEqual([
        { kind: "chain", chatId: "-100", botId: null, botMsgId: 20, ts: 2_000 },
      ]);
    });

    // The known, accepted cost of not walking the chain upwards on every save:
    // in a group another participant's turn can sit between two of the user's,
    // and then the parent is that turn's node rather than the indexed head.
    test("a turn whose parent is not the indexed head opens a second entry", async () => {
      const store = create();
      await store.indexUserThread("42", chain(10, null, 1_000));
      await store.indexUserThread("42", chain(30, 20, 2_000));
      expect(await store.listUserThreads("42")).toEqual([
        { kind: "chain", chatId: "-100", botId: null, botMsgId: 30, ts: 2_000 },
        { kind: "chain", chatId: "-100", botId: null, botMsgId: 10, ts: 1_000 },
      ]);
    });

    test("the same head in another chat is another thread", async () => {
      const store = create();
      await store.indexUserThread("42", chain(10, null, 1_000));
      await store.indexUserThread("42", {
        ...chain(20, 10, 2_000),
        chatId: "-200",
      });
      const threads = await store.listUserThreads("42");
      expect(threads.map((t) => t.chatId)).toEqual(["-200", "-100"]);
    });

    test("a guest thread keeps one entry however many turns it takes", async () => {
      const store = create();
      const guest = (ts: number) => ({
        kind: "guest" as const,
        chatId: "777",
        botId: "cat-bot",
        ts,
      });
      await store.indexUserThread("42", guest(1_000));
      await store.indexUserThread("42", guest(2_000));
      await store.indexUserThread("42", guest(3_000));
      expect(await store.listUserThreads("42")).toEqual([
        { kind: "guest", chatId: "777", botId: "cat-bot", ts: 3_000 },
      ]);
    });

    test("a guest thread and a chain in the same chat are separate entries", async () => {
      const store = create();
      await store.indexUserThread("42", {
        ...chain(10, null, 1_000),
        chatId: "777",
        botId: "cat-bot",
      });
      await store.indexUserThread("42", {
        kind: "guest",
        chatId: "777",
        botId: "cat-bot",
        ts: 2_000,
      });
      expect((await store.listUserThreads("42")).map((t) => t.kind)).toEqual([
        "guest",
        "chain",
      ]);
    });

    test("threads of different users do not mix", async () => {
      const store = create();
      await store.indexUserThread("42", chain(10, null, 1_000));
      await store.indexUserThread("43", chain(20, null, 2_000));
      expect((await store.listUserThreads("42")).map((t) => t.ts)).toEqual([
        1_000,
      ]);
      expect((await store.listUserThreads("43")).map((t) => t.ts)).toEqual([
        2_000,
      ]);
    });

    test("past the cap the oldest thread is evicted", async () => {
      const store = create();
      // One more distinct thread than the index keeps, oldest written first.
      for (let i = 0; i <= USER_THREAD_INDEX_MAX; i++) {
        await store.indexUserThread(
          "42",
          chain(10 * (i + 1), null, 1_000 * (i + 1)),
        );
      }
      const threads = await store.listUserThreads("42");
      expect(threads).toHaveLength(USER_THREAD_INDEX_MAX);
      // Newest first, and the very first thread is the one that fell off.
      expect(threads.map((t) => t.ts)).toEqual([
        6_000, 5_000, 4_000, 3_000, 2_000,
      ]);
    });

    test("a thread older than every indexed one does not displace them", async () => {
      const store = create();
      for (let i = 0; i < USER_THREAD_INDEX_MAX; i++) {
        await store.indexUserThread(
          "42",
          chain(10 * (i + 1), null, 1_000 * (i + 1)),
        );
      }
      await store.indexUserThread("42", chain(999, null, 1));
      const threads = await store.listUserThreads("42");
      expect(threads).toHaveLength(USER_THREAD_INDEX_MAX);
      expect(threads.map((t) => t.ts)).not.toContain(1);
    });

    test("a follow-up refreshes the thread's place in the order", async () => {
      const store = create();
      await store.indexUserThread("42", chain(10, null, 1_000));
      await store.indexUserThread("42", {
        ...chain(20, null, 2_000),
        chatId: "-200",
      });
      // The older thread gets a new turn and moves back to the front.
      await store.indexUserThread("42", chain(11, 10, 3_000));
      expect(await store.listUserThreads("42")).toEqual([
        { kind: "chain", chatId: "-100", botId: null, botMsgId: 11, ts: 3_000 },
        { kind: "chain", chatId: "-200", botId: null, botMsgId: 20, ts: 2_000 },
      ]);
    });
  });
}

test("the index is one list per user across every forBot scope", async () => {
  const storage = new MemoryStorage();
  // A managed bot's answer in a group is stored in the family-shared scope, a
  // guest turn in the bot's own — and both belong to the same user's index.
  await storage.forBot("cat-bot").conversations.indexUserThread("42", {
    kind: "guest",
    chatId: "777",
    botId: "cat-bot",
    ts: 2_000,
  });
  await storage
    .forBot(null)
    .conversations.indexUserThread("42", chain(10, null, 1_000));

  for (const view of [
    storage,
    storage.forBot(null),
    storage.forBot("dog-bot"),
  ]) {
    expect(
      (await view.conversations.listUserThreads("42")).map((t) => t.botId),
    ).toEqual(["cat-bot", null]);
  }
});

test("the KeyDB index key is global and its TTL follows the nodes", async () => {
  const redis = new FakeRedis();
  // A managed bot's view: per-character keys carry its prefix, the index does
  // not — every view has to reach the same list.
  const store = new KeyDBConversationsStore(
    redis as unknown as RedisClient,
    (base) => `at:mbot:cat-bot:${base}`,
  );
  await store.indexUserThread("42", chain(10, null, 1_000));
  expect([...redis.zsets.keys()]).toEqual(["at:user_threads:42"]);
  expect(redis.ttls.get("at:user_threads:42")).toBe(CONVERSATION_TTL_SECONDS);
});
