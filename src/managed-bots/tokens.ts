// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { ManagerRuntime } from "./runtime";
import type { ManagedBot } from "./types";

// Prefer the stored token; if it is missing (e.g. a crash after persisting the
// record but before the token), re-broker it from Telegram via the main bot.
export async function resolveToken(
  runtime: ManagerRuntime,
  record: ManagedBot,
): Promise<string | null> {
  const stored = await runtime.deps.storage.getManagedBotToken(record.botId);
  if (stored) return stored;
  try {
    const token = await runtime.deps.mainApi.getManagedBotToken(
      Number(record.botId),
    );
    await runtime.deps.storage.setManagedBotToken(record.botId, token);
    return token;
  } catch (err) {
    console.error(
      `[managed-bots] token re-fetch failed for ${record.botId}:`,
      err,
    );
    return null;
  }
}

// Broker a token for a bot the main bot just learned about (a `managed_bot`
// update). Nothing is persisted here — the caller owns the registry record the
// token belongs to.
export async function brokerToken(
  runtime: ManagerRuntime,
  botUserId: number,
): Promise<string | null> {
  try {
    return await runtime.deps.mainApi.getManagedBotToken(botUserId);
  } catch (err) {
    console.error(
      `[managed-bots] getManagedBotToken failed for ${botUserId}:`,
      err,
    );
    return null;
  }
}

// Re-broker the token of a bot whose polling loop just died with a 401. The
// dead token is dropped first so the next boot re-brokers instead of starting
// with it; `null` means the bot is gone from @BotFather (or Telegram handed
// back the very token that just got a 401, which would only crash again).
export async function rebrokerRevokedToken(
  runtime: ManagerRuntime,
  botId: string,
  deadToken: string,
): Promise<string | null> {
  await runtime.deps.storage.setManagedBotToken(botId, null);
  let fresh: string;
  try {
    fresh = await runtime.deps.mainApi.getManagedBotToken(Number(botId));
  } catch (refetchErr) {
    console.error(
      `[managed-bots] token revoked for ${botId} and re-broker failed (bot deleted in @BotFather?), bot stopped:`,
      refetchErr,
    );
    return null;
  }
  if (fresh === deadToken) {
    // Telegram handed back the very token that just got a 401 — restarting
    // with it would only crash this bot's polling again.
    console.error(
      `[managed-bots] re-brokered token for ${botId} is unchanged, bot stopped`,
    );
    return null;
  }
  return fresh;
}
