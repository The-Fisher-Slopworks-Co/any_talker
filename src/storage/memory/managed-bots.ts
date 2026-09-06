// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { ManagedBot } from "../../managed-bots/types";
import type { ManagedBotsStore } from "../types/managed-bots";
import type { Backing } from "../memory";

export class MemoryManagedBotsStore implements ManagedBotsStore {
  constructor(private readonly b: Backing) {}

  async list(): Promise<ManagedBot[]> {
    return [...this.b.managedBots.values()]
      .map((bot) => ({ ...bot }))
      .sort((a, b) => a.createdAtMs - b.createdAtMs);
  }

  async get(botId: string): Promise<ManagedBot | null> {
    const bot = this.b.managedBots.get(botId);
    return bot ? { ...bot } : null;
  }

  async save(bot: ManagedBot): Promise<void> {
    this.b.managedBots.set(bot.botId, { ...bot });
  }

  async delete(botId: string): Promise<void> {
    this.b.managedBots.delete(botId);
  }

  async getToken(botId: string): Promise<string | null> {
    return this.b.managedBotTokens.get(botId) ?? null;
  }

  async setToken(botId: string, token: string | null): Promise<void> {
    if (token === null) this.b.managedBotTokens.delete(botId);
    else this.b.managedBotTokens.set(botId, token);
  }
}
