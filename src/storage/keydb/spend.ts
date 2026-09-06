// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { RedisClient } from "bun";
import type { SpendStore } from "../types/spend";
import type { SpendSummary } from "../../spending/window";
import {
  SPEND_RETENTION_DAYS,
  SPEND_WINDOW_DAYS,
  recentUtcDateKeys,
  summarizeSpend,
  utcDateKey,
} from "../../spending/window";
import { PREFIX } from "./shared";

// Atomic per-day spend move for chat migration. KEYS is a flat list of
// [old, new] pairs (one per retained UTC date). Each pair is moved as one
// server-side step — GET + INCRBYFLOAT + DEL can't interleave — so when several
// family bots migrate the same chat concurrently, the second caller finds the
// old key already deleted and no total is ever doubled. The destination
// inherits the source's remaining TTL (unless it already has a fresher one) so
// migrated buckets still expire when they originally would have.
const MOVE_CHAT_SPEND_LUA = `
for i = 1, #KEYS, 2 do
  local v = redis.call('GET', KEYS[i])
  if v then
    local ttl = redis.call('TTL', KEYS[i])
    redis.call('INCRBYFLOAT', KEYS[i+1], v)
    if ttl > 0 and ttl > redis.call('TTL', KEYS[i+1]) then
      redis.call('EXPIRE', KEYS[i+1], ttl)
    end
    redis.call('DEL', KEYS[i])
  end
end
return '1'
`;

export class KeyDBSpendStore implements SpendStore {
  constructor(private readonly client: RedisClient) {}

  // Accrue a positive cost into `{keyPrefix}:{date}` (a float counter) and renew
  // its retention TTL. Shared by the user/chat/global/model spend ledgers.
  private async accrueSpend(
    keyPrefix: string,
    costUsd: number,
    nowMs: number,
  ): Promise<void> {
    const key = `${keyPrefix}:${utcDateKey(nowMs)}`;
    await this.client.send("INCRBYFLOAT", [key, String(costUsd)]);
    await this.client.expire(key, SPEND_RETENTION_DAYS * 24 * 60 * 60);
  }

  // Read the trailing day/week/month windows for a `{keyPrefix}:{date}` ledger.
  private async readSpend(
    keyPrefix: string,
    nowMs: number,
  ): Promise<SpendSummary> {
    const dates = recentUtcDateKeys(nowMs, SPEND_WINDOW_DAYS.month);
    const raws = await this.client.mget(
      ...dates.map((d) => `${keyPrefix}:${d}`),
    );
    const byDate: Record<string, number> = {};
    for (let i = 0; i < dates.length; i++) {
      const raw = raws[i];
      const n = raw === null || raw === undefined ? 0 : Number(raw);
      byDate[dates[i]!] = Number.isFinite(n) ? n : 0;
    }
    return summarizeSpend(byDate, nowMs);
  }

  // Record an id in the day's active-spender set (TTL 2 days — only the spike
  // scan reads it, and only for today).
  private async markActive(
    kind: "user" | "chat",
    id: string,
    nowMs: number,
  ): Promise<void> {
    const key = `${PREFIX}spend_active:${kind}:${utcDateKey(nowMs)}`;
    await this.client.send("SADD", [key, id]);
    await this.client.expire(key, 2 * 24 * 60 * 60);
  }

  async addUser(userId: string, costUsd: number, nowMs: number): Promise<void> {
    if (!(costUsd > 0)) return;
    await this.accrueSpend(`${PREFIX}spend:${userId}`, costUsd, nowMs);
    await this.markActive("user", userId, nowMs);
  }

  async getUser(userId: string, nowMs: number): Promise<SpendSummary> {
    return this.readSpend(`${PREFIX}spend:${userId}`, nowMs);
  }

  async addChat(chatId: string, costUsd: number, nowMs: number): Promise<void> {
    if (!(costUsd > 0)) return;
    await this.accrueSpend(`${PREFIX}spend_chat:${chatId}`, costUsd, nowMs);
    await this.markActive("chat", chatId, nowMs);
  }

  async getChat(chatId: string, nowMs: number): Promise<SpendSummary> {
    return this.readSpend(`${PREFIX}spend_chat:${chatId}`, nowMs);
  }

  async addGlobal(costUsd: number, nowMs: number): Promise<void> {
    if (!(costUsd > 0)) return;
    await this.accrueSpend(`${PREFIX}spend_global`, costUsd, nowMs);
  }

  async getGlobal(nowMs: number): Promise<SpendSummary> {
    return this.readSpend(`${PREFIX}spend_global`, nowMs);
  }

  async addModel(
    modelId: string,
    costUsd: number,
    nowMs: number,
  ): Promise<void> {
    if (!(costUsd > 0)) return;
    await this.accrueSpend(`${PREFIX}spend_model:${modelId}`, costUsd, nowMs);
    await this.client.send("SADD", [`${PREFIX}spend_models`, modelId]);
  }

  async getModel(modelId: string, nowMs: number): Promise<SpendSummary> {
    return this.readSpend(`${PREFIX}spend_model:${modelId}`, nowMs);
  }

  async listModels(): Promise<string[]> {
    const reply = await this.client.send("SMEMBERS", [`${PREFIX}spend_models`]);
    return Array.isArray(reply) ? reply.map(String) : [];
  }

  async flagUnpriced(modelId: string): Promise<void> {
    await this.client.send("SADD", [`${PREFIX}unpriced_models`, modelId]);
  }

  async listUnpriced(): Promise<string[]> {
    const reply = await this.client.send("SMEMBERS", [
      `${PREFIX}unpriced_models`,
    ]);
    return Array.isArray(reply) ? reply.map(String) : [];
  }

  async listActiveEntities(
    kind: "user" | "chat",
    nowMs: number,
  ): Promise<string[]> {
    const key = `${PREFIX}spend_active:${kind}:${utcDateKey(nowMs)}`;
    const reply = await this.client.send("SMEMBERS", [key]);
    return Array.isArray(reply) ? reply.map(String) : [];
  }

  async moveChat(
    oldChatId: string,
    newChatId: string,
    nowMs: number,
  ): Promise<void> {
    if (oldChatId === newChatId) return;
    const dates = recentUtcDateKeys(nowMs, SPEND_RETENTION_DAYS);
    const keys: string[] = [];
    for (const d of dates) {
      keys.push(
        `${PREFIX}spend_chat:${oldChatId}:${d}`,
        `${PREFIX}spend_chat:${newChatId}:${d}`,
      );
    }
    await this.client.send("EVAL", [
      MOVE_CHAT_SPEND_LUA,
      String(keys.length),
      ...keys,
    ]);
  }
}
