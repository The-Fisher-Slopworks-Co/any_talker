// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { Chat, ChatSettings } from "../../shared/types";
import { isEmptyChatSettings } from "../../shared/types";
import type { ChatsStore } from "../types/chats";
import type { Backing } from "../memory";

export class MemoryChatsStore implements ChatsStore {
  constructor(private readonly b: Backing) {}

  async list(): Promise<Chat[]> {
    return [...this.b.chats.values()]
      .map((c) => ({ ...c }))
      .sort((a, b) => b.lastSeenAt - a.lastSeenAt);
  }

  async upsert(chat: Chat): Promise<{ isNew: boolean }> {
    const existing = this.b.chats.get(chat.id);
    const isNew = existing === undefined;
    // Earliest first-seen wins (see the interface doc): ordinary upserts pass
    // "now" so the stored value survives; chat migration passes the old
    // group's instant to carry it onto the supergroup row.
    const firstSeenAt = existing
      ? Math.min(existing.firstSeenAt ?? 0, chat.firstSeenAt)
      : chat.firstSeenAt;
    this.b.chats.set(chat.id, { ...chat, firstSeenAt });
    return { isNew };
  }

  async get(id: string): Promise<Chat | null> {
    const c = this.b.chats.get(id);
    return c ? { ...c } : null;
  }

  async delete(id: string): Promise<void> {
    this.b.chats.delete(id);
  }

  async getSettings(chatId: string): Promise<ChatSettings | null> {
    const s = this.b.chatSettings.get(chatId);
    return s ? structuredClone(s) : null;
  }

  async saveSettings(chatId: string, settings: ChatSettings): Promise<void> {
    if (isEmptyChatSettings(settings)) {
      this.b.chatSettings.delete(chatId);
      return;
    }
    this.b.chatSettings.set(chatId, structuredClone(settings));
  }
}
