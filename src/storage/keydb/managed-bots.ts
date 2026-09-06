// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { RedisClient } from "bun";
import type { ManagedBotsStore } from "../types/managed-bots";
import type { ManagedBot } from "../../managed-bots/types";
import { PREFIX } from "./shared";

export class KeyDBManagedBotsStore implements ManagedBotsStore {
  constructor(private readonly client: RedisClient) {}

  async list(): Promise<ManagedBot[]> {
    const values = await this.client.hvals(`${PREFIX}managed_bots`);
    return values
      .map((raw) => JSON.parse(raw) as ManagedBot)
      .sort((a, b) => a.createdAtMs - b.createdAtMs);
  }

  async get(botId: string): Promise<ManagedBot | null> {
    const raw = await this.client.hget(`${PREFIX}managed_bots`, botId);
    return raw ? (JSON.parse(raw) as ManagedBot) : null;
  }

  async save(bot: ManagedBot): Promise<void> {
    await this.client.hset(
      `${PREFIX}managed_bots`,
      bot.botId,
      JSON.stringify(bot),
    );
  }

  async delete(botId: string): Promise<void> {
    await this.client.hdel(`${PREFIX}managed_bots`, botId);
  }

  async getToken(botId: string): Promise<string | null> {
    return await this.client.get(`${PREFIX}managed_bot_token:${botId}`);
  }

  async setToken(botId: string, token: string | null): Promise<void> {
    const key = `${PREFIX}managed_bot_token:${botId}`;
    if (token === null) await this.client.del(key);
    else await this.client.set(key, token);
  }
}
