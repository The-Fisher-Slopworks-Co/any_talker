// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { RedisClient } from "bun";
import type { UsageStore } from "../types/usage";
import type { UserUsage } from "../../shared/types";
import { USAGE_RETENTION_SECONDS } from "../../ratelimit/window";
import { PREFIX } from "./shared";

// Atomic usage accrual for the dual fixed-window limiter. The caller passes the
// current start of each window (computed from the user's deterministic phase
// offset); a stored window whose start differs has rolled over, so its `used`
// restarts at the new tokens instead of accumulating. Runs server-side so
// concurrent requests can't interleave the read-modify-write. Returns
// [fiveUsed, weeklyUsed, fiveStart, weeklyStart] as strings.
const ADD_USAGE_LUA = `
local raw = redis.call('GET', KEYS[1])
local fiveStart = tonumber(ARGV[1])
local weekStart = tonumber(ARGV[2])
local tokens = tonumber(ARGV[3])
local ttl = tonumber(ARGV[4])
local fiveUsed = tokens
local weekUsed = tokens
if raw then
  local s = cjson.decode(raw)
  if s.fiveHour and s.fiveHour.windowStart == fiveStart then
    fiveUsed = s.fiveHour.used + tokens
  end
  if s.weekly and s.weekly.windowStart == weekStart then
    weekUsed = s.weekly.used + tokens
  end
end
redis.call('SET', KEYS[1], cjson.encode({
  fiveHour = {windowStart = fiveStart, used = fiveUsed},
  weekly = {windowStart = weekStart, used = weekUsed}
}))
if ttl > 0 then redis.call('EXPIRE', KEYS[1], ttl) end
return {tostring(fiveUsed), tostring(weekUsed), tostring(fiveStart), tostring(weekStart)}
`;

function parseUsageEvalReply(reply: unknown): UserUsage {
  if (!Array.isArray(reply) || reply.length !== 4) {
    throw new Error(
      `usage EVAL returned unexpected shape: ${JSON.stringify(reply)}`,
    );
  }
  const fiveUsed = Number(reply[0]);
  const weekUsed = Number(reply[1]);
  const fiveStart = Number(reply[2]);
  const weekStart = Number(reply[3]);
  if (
    !Number.isFinite(fiveUsed) ||
    !Number.isFinite(weekUsed) ||
    !Number.isFinite(fiveStart) ||
    !Number.isFinite(weekStart)
  ) {
    throw new Error(
      `usage EVAL returned non-numeric values: ${JSON.stringify(reply)}`,
    );
  }
  return {
    fiveHour: { windowStart: fiveStart, used: fiveUsed },
    weekly: { windowStart: weekStart, used: weekUsed },
  };
}

// Usage is a shared per-user key (unscoped, like spend): the budget is global,
// not per chat or per character bot.
export class KeyDBUsageStore implements UsageStore {
  constructor(private readonly client: RedisClient) {}

  async get(userId: string): Promise<UserUsage | null> {
    const raw = await this.client.get(`${PREFIX}usage:${userId}`);
    return raw ? (JSON.parse(raw) as UserUsage) : null;
  }

  async add(
    userId: string,
    tokens: number,
    fiveHourWindowStart: number,
    weeklyWindowStart: number,
  ): Promise<UserUsage> {
    const reply = await this.client.send("EVAL", [
      ADD_USAGE_LUA,
      "1",
      `${PREFIX}usage:${userId}`,
      String(fiveHourWindowStart),
      String(weeklyWindowStart),
      String(tokens),
      String(USAGE_RETENTION_SECONDS),
    ]);
    return parseUsageEvalReply(reply);
  }

  async reset(userId: string): Promise<void> {
    await this.client.del(`${PREFIX}usage:${userId}`);
  }
}
