// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { syncFamilyCommands } from "./commands";
import { createManagedPersonaResolver } from "./persona";
import {
  createRuntime,
  type BotManagerDeps,
  type ManagedBotUser,
  type ManagerRuntime,
} from "./runtime";
import { brokerToken, resolveToken } from "./tokens";
import {
  recoverFromPollingCrash,
  startPolling,
  stopAllPolling,
  stopPolling,
} from "./supervisor";
import { pushProfileAvatar, pushProfileName, readManagerInfo } from "./profile";
import type { ReminderRuntime } from "../reminders/scheduler";
import { reminderApiFromGrammy } from "../reminders/delivery";
import type { ManagedBot } from "./types";

export type { BotManagerDeps, ManagedBotUser };

// Owns the lifecycle of every managed (character) bot: starting their polling
// loops at boot and on creation, stopping them on deletion / hot-reload, and
// exposing the per-bot reminder runtimes the scheduler iterates. Each managed
// bot is an independent grammY `Bot` with its own token and update stream.
//
// The work itself lives in three modules around the shared `ManagerRuntime`:
// `tokens.ts` brokers tokens through the main bot, `supervisor.ts` runs the
// polling loops and their crash recovery, `profile.ts` administers a running
// bot's Telegram profile.
export class BotManager {
  private readonly runtime: ManagerRuntime;

  constructor(deps: BotManagerDeps) {
    // The restart hook goes back through `this.startBot`, not the supervisor
    // function, so a subclass override still wins.
    this.runtime = createRuntime(deps, (record, token) =>
      this.startBot(record, token),
    );
  }

  // Load every persisted managed bot and start it. A token or start failure is
  // logged and skipped so one broken bot can't take down the others (or block
  // the main bot's startup).
  async loadAndStartAll(): Promise<void> {
    const records = await this.runtime.deps.storage.managedBots.list();
    for (const record of records) {
      try {
        const token = await resolveToken(this.runtime, record);
        if (!token) {
          console.error(
            `[managed-bots] no token for ${record.botId}, skipping start`,
          );
          continue;
        }
        await this.startBot(record, token);
      } catch (err) {
        console.error(`[managed-bots] failed to start ${record.botId}:`, err);
      }
    }
  }

  async startBot(record: ManagedBot, token: string): Promise<void> {
    await startPolling(this.runtime, record, token);
  }

  // Public so tests can drive the recovery matrix without a live polling loop.
  async handlePollingCrash(
    record: ManagedBot,
    deadToken: string,
    err: unknown,
  ): Promise<void> {
    await recoverFromPollingCrash(this.runtime, record, deadToken, err);
  }

  async stopBot(botId: string): Promise<void> {
    await stopPolling(this.runtime, botId);
  }

  async stopAll(): Promise<void> {
    await stopAllPolling(this.runtime);
  }

  // React to a `managed_bot` update on the main bot: only the owner may create
  // bots. Brokers the token, persists the record, and starts the bot.
  // Idempotent — a duplicate update for an already-running bot is a no-op.
  async handleManagedBotCreated(
    ownerUserId: string,
    botUser: ManagedBotUser,
  ): Promise<ManagedBot | null> {
    if (ownerUserId !== this.runtime.deps.ownerId) return null;
    const botId = String(botUser.id);
    const already = this.runtime.running.get(botId);
    if (already) return already.record;

    const token = await brokerToken(this.runtime, botUser.id);
    if (!token) return null;

    const storage = this.runtime.deps.storage;
    const existing = await storage.managedBots.get(botId);
    const record: ManagedBot = existing ?? {
      botId,
      ownerUserId,
      username: botUser.username ?? botId,
      displayName: botUser.first_name,
      systemPrompt: "",
      createdAtMs: Date.now(),
    };
    await storage.managedBots.save(record);
    await storage.managedBots.setToken(botId, token);
    await this.startBot(record, token);
    return record;
  }

  // Stop and forget a managed bot: its polling loop, registry record and token.
  // Its per-character data (reminders, facts, conversation) is left in storage —
  // orphaned reminders simply never fire (no scheduler iterates them).
  async deleteBot(botId: string): Promise<void> {
    await this.stopBot(botId);
    await this.runtime.deps.storage.managedBots.delete(botId);
    await this.runtime.deps.storage.managedBots.setToken(botId, null);
    // The family shrank: if the deleted bot was the one listing the shared
    // commands in groups, they have to move to the next-smallest id — without
    // this re-sync `/feedback` would vanish from every group menu.
    await syncFamilyCommands(this.runtime);
  }

  async syncProfileName(botId: string): Promise<void> {
    await pushProfileName(this.runtime, botId);
  }

  async setAvatar(botId: string, bytes: Uint8Array): Promise<boolean> {
    return pushProfileAvatar(this.runtime, botId, bytes);
  }

  async managerInfo(): Promise<{
    username: string | null;
    canManageBots: boolean;
  }> {
    return readManagerInfo(this.runtime);
  }

  isRunning(botId: string): boolean {
    return this.runtime.running.has(botId);
  }

  // Every running managed (character) bot's id — the main bot's family siblings.
  // The main bot uses these to recognize a bare `/ask` sent in reply to a
  // character bot's message and defer to that character (only when that character
  // is actually present in the chat). (A managed bot instead uses
  // `siblingBotIds`, which also includes the main bot and excludes itself.)
  managedBotIds(): string[] {
    return [...this.runtime.running.keys()];
  }

  // The reminder runtimes for all running managed bots. Each carries its own
  // scoped storage, api and persona resolver so the scheduler delivers every
  // reminder from the right character. The main bot's runtime is added
  // separately by the composition root.
  reminderRuntimes(): ReminderRuntime[] {
    return [...this.runtime.running.values()].map((entry) => ({
      botId: entry.record.botId,
      storage: this.runtime.deps.storage.forBot(entry.record.botId),
      api: reminderApiFromGrammy(entry.bot.api),
      resolver: createManagedPersonaResolver(
        this.runtime.deps.storage,
        entry.record.botId,
      ),
    }));
  }
}
