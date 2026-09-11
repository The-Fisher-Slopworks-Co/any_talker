// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type {
  ConversationNode,
  GuestThreadNode,
  UserThreadRef,
} from "../../shared/types";
import { USER_THREAD_INDEX_MAX } from "../../shared/types";
import {
  continuesThread,
  userThreadRef,
  type ConversationsStore,
  type UserThreadWrite,
} from "../types/conversations";
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
      ...(v.run && { run: { ...v.run, gen: [...v.run.gen] } }),
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
      ...(node.run && { run: { ...node.run, gen: [...node.run.gen] } }),
    });
  }

  async getGuest(chatId: string): Promise<GuestThreadNode | null> {
    const v = this.b.guestThreads.get(this.scope.sk(chatId));
    return v ? structuredClone(v) : null;
  }

  async saveGuest(chatId: string, thread: GuestThreadNode): Promise<void> {
    this.b.guestThreads.set(this.scope.sk(chatId), structuredClone(thread));
  }

  // Keyed by the bare user id: the index is global, so every `forBot` view of
  // the shared backing reads and writes the same list.
  async indexUserThread(userId: string, write: UserThreadWrite): Promise<void> {
    const current = this.b.userThreads.get(userId) ?? [];
    // The thread this turn continues leaves at its old head and comes back at
    // the new one; everything else keeps its place.
    const kept = current.filter((ref) => !continuesThread(ref, write));
    const next = [userThreadRef(write), ...kept]
      // Newest first, as the KeyDB index reads its ZSET back. The sort is
      // stable, so a turn sharing a millisecond with an indexed thread still
      // lands ahead of it — the order this write already put it in.
      .sort((a, b) => b.ts - a.ts)
      .slice(0, USER_THREAD_INDEX_MAX);
    this.b.userThreads.set(userId, next);
  }

  async listUserThreads(userId: string): Promise<UserThreadRef[]> {
    return (this.b.userThreads.get(userId) ?? []).map((ref) => ({ ...ref }));
  }
}
