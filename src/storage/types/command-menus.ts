// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

// One chat-scoped command menu (`BotCommandScopeChat`) this app has uploaded:
// bot, chat, and when it was applied. Its presence means "this bot hides the
// shared commands in this chat" — the only override the app ever uploads, so
// the row itself is the flag.
export type ChatCommandMenu = {
  chatId: string;
  botId: string;
  atMs: number;
};

// Registry of the chat-scoped command menus currently applied (global, not
// affected by `forBot`: every family bot writes its own rows here).
//
// It exists because Telegram offers no way to enumerate the scopes a bot has
// ever been given a menu under — `getMyCommands` only answers for a scope you
// already name, so an override nobody remembers is invisible and permanent.
// Recording every upload keeps the set revertible: whatever `list` returns can
// be handed back to `deleteMyCommands`, which drops those chats to the global
// (`all_group_chats`) menu again.
export interface CommandMenusStore {
  record(menu: ChatCommandMenu): Promise<void>;
  forget(chatId: string, botId: string): Promise<void>;
  has(chatId: string, botId: string): Promise<boolean>;
  list(): Promise<ChatCommandMenu[]>;
}
