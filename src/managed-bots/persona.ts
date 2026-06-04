// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { Storage } from "../storage/types";
import type { Settings } from "../shared/types";
import { getEffectiveSettings, getOrInitSettings } from "../settings";

// The character a bot answers as for a given chat: the effective AI settings to
// run with, plus the display name shown as the bold prefix before its replies.
export type ResolvedPersona = {
  settings: Settings;
  botName: string | null;
};

// Resolves the persona for one ask/guest turn (or reminder delivery). Injected
// into the bot so the same handlers serve both the main bot (chat-derived
// persona) and managed bots (per-character persona over global settings).
export type PersonaResolver = (chatId: string) => Promise<ResolvedPersona>;

// Main bot: settings are the global defaults merged with this chat's overrides,
// and the name is the optional per-chat `botName` — exactly today's behavior.
export function createMainPersonaResolver(storage: Storage): PersonaResolver {
  return async (chatId) => {
    const [settings, chatSettings] = await Promise.all([
      getEffectiveSettings(storage, chatId),
      storage.getChatSettings(chatId),
    ]);
    return { settings, botName: chatSettings?.botName?.trim() || null };
  };
}

// Managed bot: settings are the main bot's GLOBAL defaults only (no per-chat
// overrides) with the character's own system prompt substituted in, and the
// name is the character's display name. The record is read fresh each turn so
// owner edits take effect without restarting the bot. If the record vanishes
// (bot deleted mid-flight), fall back to global settings with no override.
export function createManagedPersonaResolver(
  storage: Storage,
  botId: string,
): PersonaResolver {
  return async () => {
    const [global, bot] = await Promise.all([
      getOrInitSettings(storage),
      storage.getManagedBot(botId),
    ]);
    if (!bot) return { settings: global, botName: null };
    return {
      settings: { ...global, systemPrompt: bot.systemPrompt },
      botName: bot.displayName.trim() || null,
    };
  };
}
