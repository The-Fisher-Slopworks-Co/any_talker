// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect } from "bun:test";
import type { RedisClient } from "bun";
import { KeyDBCommandMenusStore } from "./keydb/command-menus";

// A KeyDB stand-in covering exactly the hash commands this store issues.
class FakeRedis {
  readonly hashes = new Map<string, Map<string, string>>();

  private hash(key: string): Map<string, string> {
    let h = this.hashes.get(key);
    if (!h) {
      h = new Map();
      this.hashes.set(key, h);
    }
    return h;
  }

  async hset(key: string, field: string, value: string): Promise<number> {
    this.hash(key).set(field, value);
    return 1;
  }

  async hget(key: string, field: string): Promise<string | null> {
    return this.hash(key).get(field) ?? null;
  }

  async hdel(key: string, field: string): Promise<number> {
    return this.hash(key).delete(field) ? 1 : 0;
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    return Object.fromEntries(this.hash(key));
  }
}

// A real supergroup id is negative, so the field carries a "-" and a ":" the
// reader has to split on the right one.
const CHAT = "-1001723761423";
const BOT = "8012345678";

function make() {
  const redis = new FakeRedis();
  return {
    redis,
    store: new KeyDBCommandMenusStore(redis as unknown as RedisClient),
  };
}

test("keydb chat command menus: record, read back, forget", async () => {
  const { store } = make();
  expect(await store.has(CHAT, BOT)).toBe(false);

  await store.record({ chatId: CHAT, botId: BOT, atMs: 1000 });
  expect(await store.has(CHAT, BOT)).toBe(true);
  expect(await store.list()).toEqual([
    { chatId: CHAT, botId: BOT, atMs: 1000 },
  ]);

  await store.forget(CHAT, BOT);
  expect(await store.has(CHAT, BOT)).toBe(false);
  expect(await store.list()).toEqual([]);
});

test("keydb chat command menus live in one hash, one field per pair", async () => {
  const { redis, store } = make();

  await store.record({ chatId: CHAT, botId: BOT, atMs: 1000 });
  await store.record({ chatId: CHAT, botId: "42", atMs: 2000 });
  await store.record({ chatId: "-100999", botId: BOT, atMs: 3000 });

  expect([...redis.hashes.keys()]).toEqual(["at:chat_command_menus"]);
  expect(await store.list()).toEqual([
    { chatId: CHAT, botId: BOT, atMs: 1000 },
    { chatId: CHAT, botId: "42", atMs: 2000 },
    { chatId: "-100999", botId: BOT, atMs: 3000 },
  ]);
});
