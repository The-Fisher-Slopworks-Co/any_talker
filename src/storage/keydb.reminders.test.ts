// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import type { RedisClient } from "bun";
import {
  KeyDBRemindersStore,
  parseQuarantineEnvelope,
  parseSaveReminderReply,
} from "./keydb/reminders";

describe("parseSaveReminderReply", () => {
  test("treats '1' / 1 as success", () => {
    expect(parseSaveReminderReply("1")).toEqual({ ok: true });
    expect(parseSaveReminderReply(1)).toEqual({ ok: true });
  });

  test("treats '0' / 0 as limit_reached", () => {
    expect(parseSaveReminderReply("0")).toEqual({
      ok: false,
      reason: "limit_reached",
    });
    expect(parseSaveReminderReply(0)).toEqual({
      ok: false,
      reason: "limit_reached",
    });
  });

  test("throws on an unexpected reply shape instead of faking a result", () => {
    for (const bad of [null, undefined, "", "2", 2, {}, [], Buffer.from("1")]) {
      expect(() => parseSaveReminderReply(bad)).toThrow(
        /Unexpected EVAL reply for reminders\.saveIfUnderCap/,
      );
    }
  });
});

// A KeyDB stand-in covering exactly the commands the reminders store issues.
// Strings only, no TTL clock: these tests are about which keys survive a parse
// failure, not about expiry.
class FakeRedis {
  readonly strings = new Map<string, string>();
  readonly zsets = new Map<string, Map<string, number>>();
  failSetFor: string | null = null;

  private zset(key: string): Map<string, number> {
    let z = this.zsets.get(key);
    if (!z) {
      z = new Map();
      this.zsets.set(key, z);
    }
    return z;
  }

  async set(key: string, value: string, ..._opts: unknown[]): Promise<"OK"> {
    if (this.failSetFor === key) throw new Error("SET refused");
    this.strings.set(key, value);
    return "OK";
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

  async zrange(key: string, start: number, stop: number): Promise<string[]> {
    const all = [...this.zset(key).entries()]
      .sort((a, b) => a[1] - b[1])
      .map(([m]) => m);
    const end = stop < 0 ? all.length + stop + 1 : stop + 1;
    return all.slice(start, end);
  }

  async zrangebyscore(
    key: string,
    min: number,
    max: number,
    ..._opts: unknown[]
  ): Promise<string[]> {
    return [...this.zset(key).entries()]
      .filter(([, s]) => s >= min && s <= max)
      .sort((a, b) => a[1] - b[1])
      .map(([m]) => m);
  }

  async zremrangebyscore(
    key: string,
    min: number,
    max: number,
  ): Promise<number> {
    const z = this.zset(key);
    const doomed = [...z.entries()]
      .filter(([, s]) => s >= min && s <= max)
      .map(([m]) => m);
    for (const m of doomed) z.delete(m);
    return doomed.length;
  }
}

function makeStore(): { redis: FakeRedis; store: KeyDBRemindersStore } {
  const redis = new FakeRedis();
  const store = new KeyDBRemindersStore(
    redis as unknown as RedisClient,
    (base) => `at:${base}`,
    (botId, base) => `at:${botId ? `mbot:${botId}:` : ""}${base}`,
  );
  return { redis, store };
}

// Puts a payload the schema rejects (no `text`) on the due path.
async function seedCorrupted(redis: FakeRedis, id: string): Promise<string> {
  const raw = JSON.stringify({
    id,
    userId: "u1",
    fireAtMs: 1_000,
    target: { kind: "guest_dm", userId: "u1" },
    createdAtMs: 1,
  });
  redis.strings.set(`at:reminder:${id}`, raw);
  await redis.zadd("at:reminders:due", 1_000, id);
  return raw;
}

describe("KeyDBRemindersStore quarantine", () => {
  test("keeps the raw payload instead of destroying it", async () => {
    const { redis, store } = makeStore();
    const raw = await seedCorrupted(redis, "r1");

    expect(await store.fetchDue(2_000)).toEqual([]);

    // The live key and the due entry are gone, so the tick cannot loop…
    expect(redis.strings.has("at:reminder:r1")).toBe(false);
    expect(await redis.zrange("at:reminders:due", 0, -1)).toEqual([]);
    // …but the payload itself survives, verbatim and listable.
    expect(await store.listQuarantined()).toEqual([
      { id: "r1", raw, reason: "schema_violation", quarantinedAtMs: 2_000 },
    ]);
  });

  test("lists newest first", async () => {
    const { redis, store } = makeStore();
    await seedCorrupted(redis, "r1");
    await store.fetchDue(2_000);
    await seedCorrupted(redis, "r2");
    await store.fetchDue(3_000);

    expect((await store.listQuarantined()).map((q) => q.id)).toEqual([
      "r2",
      "r1",
    ]);
  });

  test("keeps the original when the quarantine copy cannot be written", async () => {
    const { redis, store } = makeStore();
    redis.failSetFor = "at:reminder:quarantined:r1";
    const raw = await seedCorrupted(redis, "r1");

    expect(await store.fetchDue(2_000)).toEqual([]);

    // Nothing was written aside, so nothing may be dropped either — the record
    // only leaves the due set, which is what stops the tick from looping.
    expect(redis.strings.get("at:reminder:r1")).toBe(raw);
    expect(await redis.zrange("at:reminders:due", 0, -1)).toEqual([]);
  });

  test("prunes index entries whose payload has expired", async () => {
    const { redis, store } = makeStore();
    await seedCorrupted(redis, "old");
    await store.fetchDue(2_000);
    // Payload gone the way KeyDB's TTL removes it, index entry left behind.
    redis.strings.delete("at:reminder:quarantined:old");
    expect(await store.listQuarantined()).toEqual([]);

    const thirtyOneDaysMs = 31 * 24 * 60 * 60 * 1000;
    await seedCorrupted(redis, "new");
    await store.fetchDue(thirtyOneDaysMs);
    expect((await store.listQuarantined()).map((q) => q.id)).toEqual(["new"]);
    expect(await redis.zrange("at:reminders:quarantined", 0, -1)).toEqual([
      "new",
    ]);
  });
});

describe("parseQuarantineEnvelope", () => {
  test("reads back what quarantine writes", () => {
    const raw = JSON.stringify({
      raw: "{}",
      reason: "invalid_json",
      quarantinedAtMs: 7,
    });
    expect(parseQuarantineEnvelope("r1", raw)).toEqual({
      id: "r1",
      raw: "{}",
      reason: "invalid_json",
      quarantinedAtMs: 7,
    });
  });

  test("returns null for a malformed envelope rather than throwing", () => {
    for (const bad of [
      "not json",
      "null",
      "[]",
      JSON.stringify({ reason: "invalid_json", quarantinedAtMs: 7 }),
      JSON.stringify({ raw: "{}", reason: "nope", quarantinedAtMs: 7 }),
      JSON.stringify({ raw: "{}", reason: "invalid_json" }),
    ]) {
      expect(parseQuarantineEnvelope("r1", bad)).toBeNull();
    }
  });
});
