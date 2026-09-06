// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { RedisClient } from "bun";
import type { FactsStore } from "../types/facts";
import { USER_FACTS_MAX_PER_USER } from "../types";
import type { ScopedKey } from "./shared";

// Atomic upsert with cap check: HSET if the field already exists or the
// hash is under the cap; otherwise return a sentinel. Executes server-side
// so concurrent callers cannot race the HLEN/HSET pair. Returns "1" on
// success, "0" when the limit was reached.
const REMEMBER_FACT_LUA = `
local exists = redis.call('HEXISTS', KEYS[1], ARGV[1])
if exists == 0 then
  local len = redis.call('HLEN', KEYS[1])
  if len >= tonumber(ARGV[3]) then
    -- At the cap with a NEW key: evict the oldest fact to make room rather than
    -- rejecting the write. HKEYS preserves field insertion order for the
    -- listpack encoding small hashes use (cap 50 < hash-max-listpack-entries
    -- default 128), so keys[1] is the oldest-inserted fact.
    local keys = redis.call('HKEYS', KEYS[1])
    redis.call('HDEL', KEYS[1], keys[1])
  end
end
redis.call('HSET', KEYS[1], ARGV[1], ARGV[2])
return '1'
`;

// REMEMBER_FACT_LUA now always returns the bulk string '1' (a new key at the
// cap evicts the oldest instead of being rejected), but the '0' →
// limit_reached mapping is kept for API stability. Validate defensively: any
// other reply shape (Buffer, RESP3 verbatim string, null on a transient error
// path) must throw rather than silently masquerading as a known result.
export function parseRememberFactReply(
  reply: unknown,
): { ok: true } | { ok: false; reason: "limit_reached" } {
  if (reply === "1" || reply === 1) return { ok: true };
  if (reply === "0" || reply === 0) {
    return { ok: false, reason: "limit_reached" };
  }
  throw new Error(
    `Unexpected EVAL reply for facts.remember: ${JSON.stringify(reply)}`,
  );
}

export class KeyDBFactsStore implements FactsStore {
  constructor(
    private readonly client: RedisClient,
    private readonly sk: ScopedKey,
  ) {}

  async remember(
    userId: string,
    key: string,
    value: string,
  ): Promise<{ ok: true } | { ok: false; reason: "limit_reached" }> {
    const normKey = key.toLowerCase();
    const reply = await this.client.send("EVAL", [
      REMEMBER_FACT_LUA,
      "1",
      this.sk(`user_facts:${userId}`),
      normKey,
      value,
      String(USER_FACTS_MAX_PER_USER),
    ]);
    return parseRememberFactReply(reply);
  }

  async list(userId: string): Promise<Array<{ key: string; value: string }>> {
    const all = await this.client.hgetall(this.sk(`user_facts:${userId}`));
    return Object.entries(all)
      .map(([key, value]) => ({ key, value }))
      .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  }

  async forget(userId: string, key: string): Promise<{ existed: boolean }> {
    const normKey = key.toLowerCase();
    const removed = await this.client.hdel(
      this.sk(`user_facts:${userId}`),
      normKey,
    );
    return { existed: removed > 0 };
  }
}
