// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { RedisClient } from "bun";
import type { ConversationsStore } from "../types/conversations";
import type { ConversationNode, GuestThreadNode } from "../../shared/types";
import { CONVERSATION_TTL_SECONDS } from "../../shared/types";
import type { ScopedKey } from "./shared";

export class KeyDBConversationsStore implements ConversationsStore {
  constructor(
    private readonly client: RedisClient,
    private readonly sk: ScopedKey,
  ) {}

  async get(
    chatId: string,
    botMsgId: number,
  ): Promise<ConversationNode | null> {
    const raw = await this.client.get(this.sk(`msg:${chatId}:${botMsgId}`));
    return raw ? (JSON.parse(raw) as ConversationNode) : null;
  }

  async save(
    chatId: string,
    botMsgId: number,
    node: ConversationNode,
  ): Promise<void> {
    const key = this.sk(`msg:${chatId}:${botMsgId}`);
    await this.client.set(key, JSON.stringify(node));
    await this.client.expire(key, CONVERSATION_TTL_SECONDS);
  }

  async getGuest(chatId: string): Promise<GuestThreadNode | null> {
    const raw = await this.client.get(this.sk(`guest_thread:${chatId}`));
    return raw ? (JSON.parse(raw) as GuestThreadNode) : null;
  }

  async saveGuest(chatId: string, thread: GuestThreadNode): Promise<void> {
    const key = this.sk(`guest_thread:${chatId}`);
    await this.client.set(key, JSON.stringify(thread));
    await this.client.expire(key, CONVERSATION_TTL_SECONDS);
  }
}
