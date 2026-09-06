// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { Chat, ChatSettings } from "../../shared/types";

// Chat directory and per-chat settings (global, not affected by `forBot`).
export interface ChatsStore {
  list(): Promise<Chat[]>;
  // Upserts the chat directory row, keeping the EARLIEST `firstSeenAt` of the
  // stored row and the argument (normal upserts pass "now", so the stored value
  // wins; chat migration passes the old group's instant to carry it over).
  // `{ isNew: true }` for a never-before-seen chat (a new non-private chat is a
  // fresh group join).
  upsert(chat: Chat): Promise<{ isNew: boolean }>;
  get(id: string): Promise<Chat | null>;
  // Removes a chat's directory row. Only chat migration (group→supergroup)
  // retires an id; nothing else ever deletes from the directory.
  delete(id: string): Promise<void>;

  getSettings(chatId: string): Promise<ChatSettings | null>;
  saveSettings(chatId: string, settings: ChatSettings): Promise<void>;
}
