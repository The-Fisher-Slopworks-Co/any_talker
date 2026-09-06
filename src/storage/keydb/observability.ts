// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { RedisClient } from "bun";
import type { ObservabilityStore } from "../types/observability";
import { utcDateKey } from "../../spending/window";
import { PREFIX } from "./shared";

export class KeyDBObservabilityStore implements ObservabilityStore {
  constructor(private readonly client: RedisClient) {}

  async incrementDenial(userId: string, nowMs: number): Promise<void> {
    const key = `${PREFIX}denial_rank:${utcDateKey(nowMs)}`;
    await this.client.send("ZINCRBY", [key, "1", userId]);
    await this.client.expire(key, 9 * 24 * 60 * 60);
  }

  async topDenied(
    nowMs: number,
    limit: number,
  ): Promise<Array<{ userId: string; count: number }>> {
    const n = Math.max(0, Math.floor(limit));
    if (n === 0) return [];
    const key = `${PREFIX}denial_rank:${utcDateKey(nowMs)}`;
    const reply = await this.client.send("ZREVRANGE", [
      key,
      "0",
      String(n - 1),
      "WITHSCORES",
    ]);
    const flat = Array.isArray(reply) ? reply : [];
    const out: Array<{ userId: string; count: number }> = [];
    for (let i = 0; i + 1 < flat.length; i += 2) {
      const count = Number(flat[i + 1]);
      if (Number.isFinite(count)) out.push({ userId: String(flat[i]), count });
    }
    return out;
  }

  async getDigestState(): Promise<{ lastSentAtMs: number } | null> {
    const raw = await this.client.get(`${PREFIX}digest_state`);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as { lastSentAtMs?: unknown };
      return typeof parsed.lastSentAtMs === "number"
        ? { lastSentAtMs: parsed.lastSentAtMs }
        : null;
    } catch {
      return null;
    }
  }

  async setDigestState(state: { lastSentAtMs: number }): Promise<void> {
    await this.client.set(`${PREFIX}digest_state`, JSON.stringify(state));
  }

  async claimAlert(key: string, ttlSeconds: number): Promise<boolean> {
    const reply = await this.client.send("SET", [
      `${PREFIX}alert_claim:${key}`,
      "1",
      "NX",
      "EX",
      String(Math.max(1, Math.floor(ttlSeconds))),
    ]);
    return reply === "OK";
  }
}
