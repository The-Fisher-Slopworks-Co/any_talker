// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect } from "bun:test";
import type { RedisClient } from "bun";
import { KeyDBUsageStore } from "./keydb/usage";

// A KeyDB stand-in covering what `resetAll` issues: SCAN with a MATCH glob
// (paged a few keys at a time, so the cursor loop is exercised) and DEL. Like
// the real SCAN, a key present for the whole iteration is returned even when
// others are deleted between pages.
class FakeRedis {
  readonly strings = new Map<string, string>();
  private snapshot: string[] = [];

  async send(cmd: string, args: string[]): Promise<unknown> {
    if (cmd !== "SCAN") throw new Error(`unexpected ${cmd}`);
    const cursor = Number(args[0]);
    const prefix = args[2]!.replace(/\*$/, "");
    if (cursor === 0) this.snapshot = [...this.strings.keys()];
    const all = this.snapshot;
    const page = all.slice(cursor, cursor + 2);
    const next = cursor + 2 >= all.length ? 0 : cursor + 2;
    return [String(next), page.filter((k) => k.startsWith(prefix))];
  }

  async del(...keys: string[]): Promise<number> {
    let n = 0;
    for (const k of keys) if (this.strings.delete(k)) n++;
    return n;
  }
}

test("resetAll deletes every usage key across SCAN pages and nothing else", async () => {
  const redis = new FakeRedis();
  for (const id of ["1", "2", "3", "4", "5"]) {
    redis.strings.set(`at:usage-usd:${id}`, "{}");
  }
  redis.strings.set("at:users", "{}");
  redis.strings.set("at:usage:1", "{}");
  redis.strings.set("at:spend:1", "{}");
  const store = new KeyDBUsageStore(redis as unknown as RedisClient);

  expect(await store.resetAll()).toBe(5);
  expect([...redis.strings.keys()].sort()).toEqual([
    "at:spend:1",
    "at:usage:1",
    "at:users",
  ]);
});

test("resetAll on an empty keyspace clears nothing", async () => {
  const store = new KeyDBUsageStore(new FakeRedis() as unknown as RedisClient);
  expect(await store.resetAll()).toBe(0);
});
