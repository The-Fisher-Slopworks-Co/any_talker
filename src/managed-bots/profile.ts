// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { setManagedBotAvatar } from "./avatar";
import type { ManagerRuntime } from "./runtime";

// Push the stored display name to Telegram for a running bot (best-effort).
export async function pushProfileName(
  runtime: ManagerRuntime,
  botId: string,
): Promise<void> {
  const entry = runtime.running.get(botId);
  if (!entry) return;
  const record = await runtime.deps.storage.managedBots.get(botId);
  if (!record) return;
  await entry.bot.api
    .setMyName(record.displayName)
    .catch((err) => console.error(`[managed-bots] setMyName failed:`, err));
}

// Set a running bot's avatar from raw image bytes. Returns false if the bot is
// not running or the Telegram call failed.
export async function pushProfileAvatar(
  runtime: ManagerRuntime,
  botId: string,
  bytes: Uint8Array,
): Promise<boolean> {
  const entry = runtime.running.get(botId);
  if (!entry) return false;
  return setManagedBotAvatar(entry.bot.api, bytes);
}

// Prerequisites for the native creation flow, read from the main bot: its
// @username (to build the `t.me/newbot` deep link) and whether bot management
// is enabled for it in @BotFather (`can_manage_bots`).
export async function readManagerInfo(runtime: ManagerRuntime): Promise<{
  username: string | null;
  canManageBots: boolean;
}> {
  const me = await runtime.deps.mainApi.getMe();
  return {
    username: me.username ?? null,
    canManageBots: me.can_manage_bots ?? false,
  };
}
