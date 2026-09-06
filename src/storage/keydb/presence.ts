// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { RedisClient } from "bun";
import type { PresenceStore } from "../types/presence";
import { PREFIX } from "./shared";

// Presence is a shared registry (unscoped, like `managed_bots`): every bot —
// main and managed — records its own membership under the same per-chat hash,
// field = bot id, value = last-seen epoch ms. TTL pruning is the reader's job.
export class KeyDBPresenceStore implements PresenceStore {
  constructor(private readonly client: RedisClient) {}

  async record(chatId: string, botId: string, atMs: number): Promise<void> {
    await this.client.hset(
      `${PREFIX}bot_presence:${chatId}`,
      botId,
      String(atMs),
    );
  }

  async remove(chatId: string, botId: string): Promise<void> {
    await this.client.hdel(`${PREFIX}bot_presence:${chatId}`, botId);
  }

  async get(chatId: string): Promise<Record<string, number>> {
    const raw = await this.client.hgetall(`${PREFIX}bot_presence:${chatId}`);
    const out: Record<string, number> = {};
    for (const [botId, ms] of Object.entries(raw)) {
      const n = Number(ms);
      if (Number.isFinite(n)) out[botId] = n;
    }
    return out;
  }
}
