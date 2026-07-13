// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { Bot, GrammyError, type Api } from "grammy";
import { proxiedFetch } from "../proxy";
import type { Storage } from "../storage/types";
import type { RateLimiter } from "../ratelimit/types";
import type { BudgetGuard } from "../budget/types";
import type { AIClient } from "../ai/types";
import type { LogFormat } from "../log";
import { createBot, type BotDeps } from "../bot";
import { syncBotCommands } from "../bot/commands";
import type { BotContext } from "../bot/middleware/lang";
import { ALLOWED_UPDATES } from "../bot/allowed-updates";
import { createManagedPersonaResolver } from "./persona";
import { setManagedBotAvatar } from "./avatar";
import type { ReminderRuntime } from "../reminders/scheduler";
import { reminderApiFromGrammy } from "../reminders/delivery";
import type { ManagedBot } from "./types";

// Minimal shape of the Telegram bot user carried by a `managed_bot` update /
// `managed_bot_created` service message.
export type ManagedBotUser = {
  id: number;
  username?: string;
  first_name: string;
};

type RunningBot = {
  record: ManagedBot;
  bot: Bot<BotContext>;
};

export type BotManagerDeps = {
  storage: Storage;
  rateLimiter: RateLimiter;
  budgetGuard: BudgetGuard;
  ai: AIClient;
  ownerId: string;
  // The main bot's api — used to broker managed bot tokens (getManagedBotToken).
  mainApi: Api;
  // The main bot's user id. A managed bot treats it as a sibling when deciding
  // whether it is alone in a group (so a bare `/ask` defers to the main bot).
  mainBotId: string;
  logFormat: LogFormat;
  logIncomingUpdates: boolean;
  logDebug: boolean;
};

// Owns the lifecycle of every managed (character) bot: starting their polling
// loops at boot and on creation, stopping them on deletion / hot-reload, and
// exposing the per-bot reminder runtimes the scheduler iterates. Each managed
// bot is an independent grammY `Bot` with its own token and update stream.
export class BotManager {
  private readonly running = new Map<string, RunningBot>();
  // Ids whose startBot is mid-flight (between its first await and `running.set`).
  // Guards against two concurrent starts for the same bot — e.g. a boot-time
  // `loadAndStartAll` racing a `managed_bot` update — spawning two polling loops
  // (which would conflict on Telegram's getUpdates).
  private readonly starting = new Set<string>();

  constructor(private readonly deps: BotManagerDeps) {}

  // Load every persisted managed bot and start it. A token or start failure is
  // logged and skipped so one broken bot can't take down the others (or block
  // the main bot's startup).
  async loadAndStartAll(): Promise<void> {
    const records = await this.deps.storage.listManagedBots();
    for (const record of records) {
      try {
        const token = await this.resolveToken(record);
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

  // Prefer the stored token; if it is missing (e.g. a crash after persisting the
  // record but before the token), re-broker it from Telegram via the main bot.
  private async resolveToken(record: ManagedBot): Promise<string | null> {
    const stored = await this.deps.storage.getManagedBotToken(record.botId);
    if (stored) return stored;
    try {
      const token = await this.deps.mainApi.getManagedBotToken(
        Number(record.botId),
      );
      await this.deps.storage.setManagedBotToken(record.botId, token);
      return token;
    } catch (err) {
      console.error(
        `[managed-bots] token re-fetch failed for ${record.botId}:`,
        err,
      );
      return null;
    }
  }

  async startBot(record: ManagedBot, token: string): Promise<void> {
    if (this.running.has(record.botId) || this.starting.has(record.botId)) return;
    this.starting.add(record.botId);
    try {
      await this.startBotInner(record, token);
    } finally {
      this.starting.delete(record.botId);
    }
  }

  private async startBotInner(record: ManagedBot, token: string): Promise<void> {
    // Refresh the username from Telegram so the stored record (and the admin UI)
    // reflects the bot's current @username even if it was renamed in @BotFather.
    // A throwaway client is used purely for the getMe call (it is never started,
    // so there is no polling conflict with the real bot below).
    let username = record.username;
    try {
      const me = await new Bot(token, {
        client: { fetch: proxiedFetch as unknown as typeof fetch },
      }).api.getMe();
      if (me.username) username = me.username;
    } catch (err) {
      console.error(`[managed-bots] getMe failed for ${record.botId}:`, err);
    }
    if (username !== record.username) {
      record = { ...record, username };
      await this.deps.storage
        .saveManagedBot(record)
        .catch((err) =>
          console.error(`[managed-bots] persist username failed:`, err),
        );
    }

    const deps: BotDeps = {
      botToken: token,
      ownerId: this.deps.ownerId,
      storage: this.deps.storage,
      rateLimiter: this.deps.rateLimiter,
      budgetGuard: this.deps.budgetGuard,
      ai: this.deps.ai,
      resolver: createManagedPersonaResolver(this.deps.storage, record.botId),
      persona: { botId: record.botId },
      siblingBotIds: () => this.siblingBotIds(record.botId),
      logFormat: this.deps.logFormat,
      logIncomingUpdates: this.deps.logIncomingUpdates,
      logDebug: this.deps.logDebug,
    };
    const bot = createBot(deps);
    await bot.api
      .deleteWebhook()
      .catch((err) => console.error(`[managed-bots] deleteWebhook failed:`, err));
    // Sync the Telegram display name to the character's name (best-effort).
    await bot.api
      .setMyName(record.displayName)
      .catch((err) => console.error(`[managed-bots] setMyName failed:`, err));
    // Register the `/ask` command menu for this bot too (best-effort), so a
    // managed bot exposes the same commands as the main bot in its own DMs.
    await syncBotCommands(bot.api).catch((err) =>
      console.error(`[managed-bots] syncBotCommands failed:`, err),
    );
    // grammY rethrows a fatal getUpdates error (401 unauthorized / 409
    // conflict) out of the polling loop. Left uncaught it would be an unhandled
    // rejection and take down the whole process — main bot included — so a dead
    // character bot is unregistered here and recovery is attempted instead.
    bot.start({
      drop_pending_updates: true,
      allowed_updates: [...ALLOWED_UPDATES],
    }).catch((err) => {
      const entry = this.running.get(record.botId);
      // Already stopped via stopBot/deleteBot, or replaced by a newer
      // instance — this death is stale and not ours to handle.
      if (!entry || entry.bot !== bot) return;
      this.running.delete(record.botId);
      this.handlePollingCrash(record, token, err).catch((recoverErr) =>
        console.error(
          `[managed-bots] crash recovery failed for ${record.botId}:`,
          recoverErr,
        ),
      );
    });
    this.running.set(record.botId, { record, bot });
    console.log(`[managed-bots] started ${record.botId} (@${username})`);
  }

  // React to a managed bot's polling loop dying (the bot has already been
  // removed from `running`). A 401 means the token was revoked — the bot was
  // deleted in @BotFather or its token was rotated — so re-broker it via the
  // main bot: rotation yields a fresh token to restart with; deletion makes the
  // re-broker fail and the bot stays stopped, its registry record kept so the
  // owner can clean it up from the admin UI. Any other death (e.g. a 409
  // getUpdates conflict) just leaves the bot stopped. Public so tests can drive
  // the recovery matrix without a live polling loop.
  async handlePollingCrash(
    record: ManagedBot,
    deadToken: string,
    err: unknown,
  ): Promise<void> {
    const botId = record.botId;
    if (!(err instanceof GrammyError) || err.error_code !== 401) {
      console.error(
        `[managed-bots] polling crashed for ${botId}, bot stopped:`,
        err,
      );
      return;
    }
    // The stored token just got a 401 and is dead either way — drop it so the
    // next boot re-brokers a token instead of starting with this one.
    await this.deps.storage.setManagedBotToken(botId, null);
    let fresh: string;
    try {
      fresh = await this.deps.mainApi.getManagedBotToken(Number(botId));
    } catch (refetchErr) {
      console.error(
        `[managed-bots] token revoked for ${botId} and re-broker failed (bot deleted in @BotFather?), bot stopped:`,
        refetchErr,
      );
      return;
    }
    if (fresh === deadToken) {
      // Telegram handed back the very token that just got a 401 — restarting
      // with it would only crash this bot's polling again.
      console.error(
        `[managed-bots] re-brokered token for ${botId} is unchanged, bot stopped`,
      );
      return;
    }
    const current = await this.deps.storage.getManagedBot(botId);
    // Deleted via the admin UI while recovering — don't resurrect it.
    if (!current) return;
    await this.deps.storage.setManagedBotToken(botId, fresh);
    console.log(
      `[managed-bots] token for ${botId} was rotated, restarting with the new one`,
    );
    await this.startBot(current, fresh);
  }

  async stopBot(botId: string): Promise<void> {
    const entry = this.running.get(botId);
    if (!entry) return;
    this.running.delete(botId);
    await entry.bot
      .stop()
      .catch((err) => console.error(`[managed-bots] stop failed ${botId}:`, err));
  }

  async stopAll(): Promise<void> {
    await Promise.allSettled(
      [...this.running.keys()].map((id) => this.stopBot(id)),
    );
  }

  // React to a `managed_bot` update on the main bot: only the owner may create
  // bots. Brokers the token, persists the record, and starts the bot.
  // Idempotent — a duplicate update for an already-running bot is a no-op.
  async handleManagedBotCreated(
    ownerUserId: string,
    botUser: ManagedBotUser,
  ): Promise<ManagedBot | null> {
    if (ownerUserId !== this.deps.ownerId) return null;
    const botId = String(botUser.id);
    const already = this.running.get(botId);
    if (already) return already.record;

    let token: string;
    try {
      token = await this.deps.mainApi.getManagedBotToken(botUser.id);
    } catch (err) {
      console.error(
        `[managed-bots] getManagedBotToken failed for ${botId}:`,
        err,
      );
      return null;
    }

    const existing = await this.deps.storage.getManagedBot(botId);
    const record: ManagedBot = existing ?? {
      botId,
      ownerUserId,
      username: botUser.username ?? botId,
      displayName: botUser.first_name,
      systemPrompt: "",
      createdAtMs: Date.now(),
    };
    await this.deps.storage.saveManagedBot(record);
    await this.deps.storage.setManagedBotToken(botId, token);
    await this.startBot(record, token);
    return record;
  }

  // Stop and forget a managed bot: its polling loop, registry record and token.
  // Its per-character data (reminders, facts, conversation) is left in storage —
  // orphaned reminders simply never fire (no scheduler iterates them).
  async deleteBot(botId: string): Promise<void> {
    await this.stopBot(botId);
    await this.deps.storage.deleteManagedBot(botId);
    await this.deps.storage.setManagedBotToken(botId, null);
  }

  // Push the stored display name to Telegram for a running bot (best-effort).
  async syncProfileName(botId: string): Promise<void> {
    const entry = this.running.get(botId);
    if (!entry) return;
    const record = await this.deps.storage.getManagedBot(botId);
    if (!record) return;
    await entry.bot.api
      .setMyName(record.displayName)
      .catch((err) => console.error(`[managed-bots] setMyName failed:`, err));
  }

  // Set a running bot's avatar from raw image bytes. Returns false if the bot is
  // not running or the Telegram call failed.
  async setAvatar(botId: string, bytes: Uint8Array): Promise<boolean> {
    const entry = this.running.get(botId);
    if (!entry) return false;
    return setManagedBotAvatar(entry.bot.api, bytes);
  }

  isRunning(botId: string): boolean {
    return this.running.has(botId);
  }

  // Every running managed (character) bot's id — the main bot's family siblings.
  // The main bot uses these to recognize a bare `/ask` sent in reply to a
  // character bot's message and defer to that character (only when that character
  // is actually present in the chat). (A managed bot instead uses
  // `siblingBotIds`, which also includes the main bot and excludes itself.)
  managedBotIds(): string[] {
    return [...this.running.keys()];
  }

  // The other family bots a managed bot shares chats with: the main bot plus
  // every OTHER running managed bot (self excluded). Used by the bare-`/ask`
  // alone-check — a managed bot stays silent on a bare `/ask` in a group while
  // any of these is present there.
  private siblingBotIds(selfBotId: string): string[] {
    const ids = [this.deps.mainBotId];
    for (const id of this.running.keys()) {
      if (id !== selfBotId) ids.push(id);
    }
    return ids;
  }

  // Prerequisites for the native creation flow, read from the main bot: its
  // @username (to build the `t.me/newbot` deep link) and whether bot management
  // is enabled for it in @BotFather (`can_manage_bots`).
  async managerInfo(): Promise<{
    username: string | null;
    canManageBots: boolean;
  }> {
    const me = await this.deps.mainApi.getMe();
    return {
      username: me.username ?? null,
      canManageBots: me.can_manage_bots ?? false,
    };
  }

  // The reminder runtimes for all running managed bots. Each carries its own
  // scoped storage, api and persona resolver so the scheduler delivers every
  // reminder from the right character. The main bot's runtime is added
  // separately by the composition root.
  reminderRuntimes(): ReminderRuntime[] {
    return [...this.running.values()].map((entry) => ({
      botId: entry.record.botId,
      storage: this.deps.storage.forBot(entry.record.botId),
      api: reminderApiFromGrammy(entry.bot.api),
      resolver: createManagedPersonaResolver(
        this.deps.storage,
        entry.record.botId,
      ),
    }));
  }
}
