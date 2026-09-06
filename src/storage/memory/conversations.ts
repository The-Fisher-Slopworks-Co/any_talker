// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { ConversationNode, GuestThreadNode } from "../../shared/types";
import type { ConversationsStore } from "../types/conversations";
import type { Backing, Scope } from "../memory";

export class MemoryConversationsStore implements ConversationsStore {
  constructor(
    private readonly b: Backing,
    private readonly scope: Scope,
  ) {}

  private convKey(chatId: string, botMsgId: number): string {
    return this.scope.sk(`${chatId}:${botMsgId}`);
  }

  async get(
    chatId: string,
    botMsgId: number,
  ): Promise<ConversationNode | null> {
    const v = this.b.conversations.get(this.convKey(chatId, botMsgId));
    if (!v) return null;
    return {
      ...v,
      ...(v.userImageFileIds && { userImageFileIds: [...v.userImageFileIds] }),
      ...(v.toolCalls && { toolCalls: v.toolCalls.map((r) => ({ ...r })) }),
    };
  }

  async save(
    chatId: string,
    botMsgId: number,
    node: ConversationNode,
  ): Promise<void> {
    this.b.conversations.set(this.convKey(chatId, botMsgId), {
      ...node,
      ...(node.userImageFileIds && {
        userImageFileIds: [...node.userImageFileIds],
      }),
      ...(node.toolCalls && {
        toolCalls: node.toolCalls.map((r) => ({ ...r })),
      }),
    });
  }

  async getGuest(chatId: string): Promise<GuestThreadNode | null> {
    const v = this.b.guestThreads.get(this.scope.sk(chatId));
    return v ? structuredClone(v) : null;
  }

  async saveGuest(chatId: string, thread: GuestThreadNode): Promise<void> {
    this.b.guestThreads.set(this.scope.sk(chatId), structuredClone(thread));
  }
}
