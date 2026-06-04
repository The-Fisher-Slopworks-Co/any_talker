// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

// A character bot the owner created and runs through the main bot via the
// Bot API 9.6 Managed Bots flow. Each managed bot is a distinct Telegram bot
// with its own token, avatar, name and persona, co-existing with the main bot
// in the same chats. Configuration (models, rate limits, provider routing) is
// inherited from the main bot's *global* settings; only the persona — name and
// system prompt — plus its own reminders and per-character memory are unique.
export type ManagedBot = {
  // Telegram user id of the bot. Doubles as the storage scope token for all
  // per-character data (conversation, reminders, facts, …) and as the stable
  // primary key. Never empty for a managed bot; the main bot uses the `null`
  // scope, which yields the legacy unprefixed keys.
  botId: string;
  // Telegram user id of the owner who created the bot.
  ownerUserId: string;
  // Telegram @username (without the leading @). Used to build the strict
  // `/ask@username` command matcher so the bot only answers when addressed.
  username: string;
  // Display name shown as the bold prefix before every reply (the in-chat
  // character name, e.g. "Кошечка").
  displayName: string;
  // The character's system prompt; overrides the global `Settings.systemPrompt`
  // for this bot only.
  systemPrompt: string;
  createdAtMs: number;
};
