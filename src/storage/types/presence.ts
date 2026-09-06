// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

// Cross-bot presence registry (global, not affected by `forBot`): tracks which
// "family" bots (main + managed) are members of each group chat, so a managed
// bot can tell whether it is alone there and may answer a bare `/ask`. Each
// entry maps a bot id to its last-seen epoch ms; the value is refreshed on
// membership changes and on activity, and the reader prunes stale entries by
// TTL. Private chats are never tracked (a DM is inherently one-bot).
export interface PresenceStore {
  record(chatId: string, botId: string, atMs: number): Promise<void>;
  remove(chatId: string, botId: string): Promise<void>;
  get(chatId: string): Promise<Record<string, number>>;
}
