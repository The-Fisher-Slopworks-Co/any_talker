// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import type { RedisClient } from "bun";
import { KeyDBFeedbackStore } from "./keydb/feedback";
import type { FeedbackEntry } from "../shared/types/feedback";

// A KeyDB stand-in covering exactly the commands the feedback store issues.
// `zrevrangebyscore` reproduces the two things the listing depends on: score
// order (descending, ties broken by member lex descending) and the exclusive
// `(score` bound the cursor is built from.
class FakeRedis {
  readonly strings = new Map<string, string>();
  readonly zsets = new Map<string, Map<string, number>>();

  private zset(key: string): Map<string, number> {
    let z = this.zsets.get(key);
    if (!z) {
      z = new Map();
      this.zsets.set(key, z);
    }
    return z;
  }

  async set(key: string, value: string): Promise<"OK"> {
    this.strings.set(key, value);
    return "OK";
  }

  async get(key: string): Promise<string | null> {
    return this.strings.get(key) ?? null;
  }

  async mget(...keys: string[]): Promise<(string | null)[]> {
    return keys.map((k) => this.strings.get(k) ?? null);
  }

  async del(key: string): Promise<number> {
    return this.strings.delete(key) ? 1 : 0;
  }

  async zadd(key: string, score: number, member: string): Promise<number> {
    this.zset(key).set(member, score);
    return 1;
  }

  async zrem(key: string, ...members: string[]): Promise<number> {
    const z = this.zset(key);
    let n = 0;
    for (const m of members) if (z.delete(m)) n++;
    return n;
  }

  async zscore(key: string, member: string): Promise<number | null> {
    return this.zset(key).get(member) ?? null;
  }

  async zrevrangebyscore(
    key: string,
    max: string,
    min: string,
    _limit?: string,
    offset?: number,
    count?: number,
  ): Promise<string[]> {
    const bound = (raw: string, fallback: number): [number, boolean] =>
      raw === "+inf" || raw === "-inf"
        ? [fallback, false]
        : raw.startsWith("(")
          ? [Number(raw.slice(1)), true]
          : [Number(raw), false];
    const [hi, hiExclusive] = bound(max, Infinity);
    const [lo, loExclusive] = bound(min, -Infinity);
    const ordered = [...this.zset(key).entries()]
      .filter(([, s]) => (hiExclusive ? s < hi : s <= hi))
      .filter(([, s]) => (loExclusive ? s > lo : s >= lo))
      .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0))
      .map(([m]) => m);
    if (count === undefined) return ordered;
    return ordered.slice(offset ?? 0, (offset ?? 0) + count);
  }
}

function makeStore(): { redis: FakeRedis; store: KeyDBFeedbackStore } {
  const redis = new FakeRedis();
  return {
    redis,
    store: new KeyDBFeedbackStore(redis as unknown as RedisClient),
  };
}

function makeFeedback(over: Partial<FeedbackEntry> = {}): FeedbackEntry {
  return {
    id: "f1",
    userId: "user-1",
    chatId: "chat-1",
    chatType: "private",
    botId: null,
    isGuest: false,
    lang: "en",
    text: "a bad answer",
    createdAt: 1_000,
    threads: [],
    systemPrompt: "You are a bot.",
    systemPromptHash: "0123456789abcdef",
    build: null,
    status: "new",
    ...over,
  };
}

describe("KeyDBFeedbackStore", () => {
  test("save writes the payload and both indexes under the global prefix", async () => {
    const { redis, store } = makeStore();
    await store.save(makeFeedback());
    expect(redis.strings.has("at:feedback:f1")).toBe(true);
    expect([...redis.zsets.get("at:feedback:z")!.entries()]).toEqual([
      ["f1", 1_000],
    ]);
    expect([...redis.zsets.get("at:feedback:z:new")!.entries()]).toEqual([
      ["f1", 1_000],
    ]);
  });

  test("save then get round-trips the record", async () => {
    const { store } = makeStore();
    await store.save(makeFeedback());
    expect(await store.get("f1")).toEqual(makeFeedback());
  });

  test("the cursor is exclusive, so a page never repeats its predecessor", async () => {
    const { store } = makeStore();
    for (let i = 1; i <= 5; i++) {
      await store.save(makeFeedback({ id: `f${i}`, createdAt: i * 100 }));
    }
    const first = await store.list({ limit: 2 });
    expect(first.entries.map((e) => e.id)).toEqual(["f5", "f4"]);
    expect(first.nextCursor).toBe(400);

    const second = await store.list({ limit: 2, cursor: first.nextCursor! });
    expect(second.entries.map((e) => e.id)).toEqual(["f3", "f2"]);

    const last = await store.list({ limit: 2, cursor: second.nextCursor! });
    expect(last.entries.map((e) => e.id)).toEqual(["f1"]);
    expect(last.nextCursor).toBeNull();
  });

  test("a status filter reads its own index rather than filtering a page", async () => {
    const { store } = makeStore();
    // Enough closed records ahead of the new one that post-filtering a page of
    // the unfiltered index would return nothing at all.
    for (let i = 1; i <= 3; i++) {
      await store.save(
        makeFeedback({ id: `c${i}`, createdAt: 100 + i, status: "closed" }),
      );
    }
    await store.save(makeFeedback({ id: "n1", createdAt: 50 }));
    const page = await store.list({ status: "new", limit: 2 });
    expect(page.entries.map((e) => e.id)).toEqual(["n1"]);
    expect(page.nextCursor).toBeNull();
  });

  test("re-saving under a new status leaves the old status index", async () => {
    const { redis, store } = makeStore();
    await store.save(makeFeedback());
    await store.save(makeFeedback({ status: "closed" }));
    expect((await store.get("f1"))?.status).toBe("closed");
    expect([...redis.zsets.get("at:feedback:z:new")!.keys()]).toEqual([]);
    expect([...redis.zsets.get("at:feedback:z:closed")!.keys()]).toEqual([
      "f1",
    ]);
    // The unfiltered index keeps its score, so paging order is unchanged.
    expect(redis.zsets.get("at:feedback:z")!.get("f1")).toBe(1_000);
  });

  test("delete clears the payload and every index that referenced it", async () => {
    const { redis, store } = makeStore();
    await store.save(makeFeedback({ status: "closed" }));
    await store.delete("f1");
    expect(await store.get("f1")).toBeNull();
    expect(redis.strings.size).toBe(0);
    for (const key of ["z", "z:new", "z:closed"]) {
      expect([
        ...(redis.zsets.get(`at:feedback:${key}`)?.keys() ?? []),
      ]).toEqual([]);
    }
  });

  test("a missing payload is skipped without moving the cursor onto older rows", async () => {
    const { redis, store } = makeStore();
    for (let i = 1; i <= 3; i++) {
      await store.save(makeFeedback({ id: `f${i}`, createdAt: i * 100 }));
    }
    // The page's own boundary record loses its payload: the entry drops out of
    // the page, but the cursor still comes from the index, so the next page
    // starts below it instead of replaying f2.
    redis.strings.delete("at:feedback:f2");
    const page = await store.list({ limit: 2 });
    expect(page.entries.map((e) => e.id)).toEqual(["f3"]);
    expect(page.nextCursor).toBe(200);
    const next = await store.list({ limit: 2, cursor: page.nextCursor! });
    expect(next.entries.map((e) => e.id)).toEqual(["f1"]);
  });

  test("an unreadable payload is skipped rather than failing the listing", async () => {
    const { redis, store } = makeStore();
    await store.save(makeFeedback({ id: "good", createdAt: 200 }));
    await store.save(makeFeedback({ id: "bad", createdAt: 100 }));
    redis.strings.set("at:feedback:bad", "{not json");
    expect((await store.list()).entries.map((e) => e.id)).toEqual(["good"]);
    expect(await store.get("bad")).toBeNull();
  });
});
