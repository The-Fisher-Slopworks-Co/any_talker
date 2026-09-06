// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { RedisClient } from "bun";
import type { ChatsStore } from "../types/chats";
import type { Chat, ChatSettings } from "../../shared/types";
import { isEmptyChatSettings } from "../../shared/types";
import { PREFIX, withFirstSeen } from "./shared";

export class KeyDBChatsStore implements ChatsStore {
  constructor(private readonly client: RedisClient) {}

  async list(): Promise<Chat[]> {
    const values = await this.client.hvals(`${PREFIX}chats`);
    return values
      .map((raw) => withFirstSeen(JSON.parse(raw) as Chat))
      .sort((a, b) => b.lastSeenAt - a.lastSeenAt);
  }

  async upsert(chat: Chat): Promise<{ isNew: boolean }> {
    const existingRaw = await this.client.hget(`${PREFIX}chats`, chat.id);
    const prev = existingRaw
      ? withFirstSeen(JSON.parse(existingRaw) as Chat)
      : null;
    // Earliest first-seen wins: ordinary upserts pass "now" (≥ stored, so the
    // stored value survives, as before), while chat migration passes the old
    // group's instant to carry it onto the supergroup row.
    const record: Chat = {
      ...chat,
      firstSeenAt: prev
        ? Math.min(prev.firstSeenAt, chat.firstSeenAt)
        : chat.firstSeenAt,
    };
    await this.client.hset(`${PREFIX}chats`, chat.id, JSON.stringify(record));
    return { isNew: prev === null };
  }

  async get(id: string): Promise<Chat | null> {
    const raw = await this.client.hget(`${PREFIX}chats`, id);
    return raw ? withFirstSeen(JSON.parse(raw) as Chat) : null;
  }

  async delete(id: string): Promise<void> {
    await this.client.hdel(`${PREFIX}chats`, id);
  }

  async getSettings(chatId: string): Promise<ChatSettings | null> {
    const raw = await this.client.get(`${PREFIX}chat_settings:${chatId}`);
    return raw ? (JSON.parse(raw) as ChatSettings) : null;
  }

  async saveSettings(chatId: string, settings: ChatSettings): Promise<void> {
    const key = `${PREFIX}chat_settings:${chatId}`;
    if (isEmptyChatSettings(settings)) {
      await this.client.del(key);
      return;
    }
    await this.client.set(key, JSON.stringify(settings));
  }
}
