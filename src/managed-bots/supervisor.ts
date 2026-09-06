// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { Bot, GrammyError } from "grammy";
import { proxiedFetch } from "../proxy";
import { createBot, type BotDeps } from "../bot";
import { syncBotCommands } from "../bot/commands";
import { ALLOWED_UPDATES } from "../bot/allowed-updates";
import { createManagedPersonaResolver } from "./persona";
import { rebrokerRevokedToken } from "./tokens";
import type { ManagerRuntime } from "./runtime";
import type { ManagedBot } from "./types";

export async function startPolling(
  runtime: ManagerRuntime,
  record: ManagedBot,
  token: string,
): Promise<void> {
  if (runtime.running.has(record.botId) || runtime.starting.has(record.botId))
    return;
  runtime.starting.add(record.botId);
  try {
    await startBotInner(runtime, record, token);
  } finally {
    runtime.starting.delete(record.botId);
  }
}

async function startBotInner(
  runtime: ManagerRuntime,
  record: ManagedBot,
  token: string,
): Promise<void> {
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
    await runtime.deps.storage.managedBots
      .save(record)
      .catch((err) =>
        console.error(`[managed-bots] persist username failed:`, err),
      );
  }

  const deps: BotDeps = {
    botToken: token,
    ownerId: runtime.deps.ownerId,
    storage: runtime.deps.storage,
    rateLimiter: runtime.deps.rateLimiter,
    budgetGuard: runtime.deps.budgetGuard,
    ai: runtime.deps.ai,
    resolver: createManagedPersonaResolver(runtime.deps.storage, record.botId),
    supportsVideoInput: runtime.deps.supportsVideoInput,
    persona: { botId: record.botId },
    siblingBotIds: () => runtime.siblingBotIds(record.botId),
    logFormat: runtime.deps.logFormat,
    logIncomingUpdates: runtime.deps.logIncomingUpdates,
    logDebug: runtime.deps.logDebug,
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
  await syncBotCommands(bot.api, runtime.deps.ownerId).catch((err) =>
    console.error(`[managed-bots] syncBotCommands failed:`, err),
  );
  // grammY rethrows a fatal getUpdates error (401 unauthorized / 409
  // conflict) out of the polling loop. Left uncaught it would be an unhandled
  // rejection and take down the whole process — main bot included — so a dead
  // character bot is unregistered here and recovery is attempted instead.
  bot
    .start({
      drop_pending_updates: true,
      allowed_updates: [...ALLOWED_UPDATES],
    })
    .catch((err) => {
      const entry = runtime.running.get(record.botId);
      // Already stopped via stopBot/deleteBot, or replaced by a newer
      // instance — this death is stale and not ours to handle.
      if (!entry || entry.bot !== bot) return;
      runtime.running.delete(record.botId);
      recoverFromPollingCrash(runtime, record, token, err).catch((recoverErr) =>
        console.error(
          `[managed-bots] crash recovery failed for ${record.botId}:`,
          recoverErr,
        ),
      );
    });
  runtime.running.set(record.botId, { record, bot });
  console.log(`[managed-bots] started ${record.botId} (@${username})`);
}

// React to a managed bot's polling loop dying (the bot has already been
// removed from `running`). A 401 means the token was revoked — the bot was
// deleted in @BotFather or its token was rotated — so re-broker it via the
// main bot: rotation yields a fresh token to restart with; deletion makes the
// re-broker fail and the bot stays stopped, its registry record kept so the
// owner can clean it up from the admin UI. Any other death (e.g. a 409
// getUpdates conflict) just leaves the bot stopped.
export async function recoverFromPollingCrash(
  runtime: ManagerRuntime,
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
  const fresh = await rebrokerRevokedToken(runtime, botId, deadToken);
  if (!fresh) return;
  const current = await runtime.deps.storage.managedBots.get(botId);
  // Deleted via the admin UI while recovering — don't resurrect it.
  if (!current) return;
  await runtime.deps.storage.managedBots.setToken(botId, fresh);
  console.log(
    `[managed-bots] token for ${botId} was rotated, restarting with the new one`,
  );
  await runtime.startBot(current, fresh);
}

export async function stopPolling(
  runtime: ManagerRuntime,
  botId: string,
): Promise<void> {
  const entry = runtime.running.get(botId);
  if (!entry) return;
  runtime.running.delete(botId);
  await entry.bot
    .stop()
    .catch((err) => console.error(`[managed-bots] stop failed ${botId}:`, err));
}

export async function stopAllPolling(runtime: ManagerRuntime): Promise<void> {
  await Promise.allSettled(
    [...runtime.running.keys()].map((id) => stopPolling(runtime, id)),
  );
}
