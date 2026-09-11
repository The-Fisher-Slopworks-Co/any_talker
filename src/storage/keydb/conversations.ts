// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { RedisClient } from "bun";
import {
  continuesThread,
  userThreadRef,
  type ConversationsStore,
  type UserThreadWrite,
} from "../types/conversations";
import type {
  ConversationNode,
  GuestThreadNode,
  UserThreadRef,
} from "../../shared/types";
import {
  CONVERSATION_TTL_SECONDS,
  USER_THREAD_INDEX_MAX,
} from "../../shared/types";
import { PREFIX, type ScopedKey } from "./shared";

// The per-user thread index, built from `PREFIX` directly rather than through
// `sk`: it is global, so every `forBot` view addresses the same key. A ZSET
// scored by the head turn's timestamp — the cap is then a rank range the server
// applies, and two turns racing in different chats both land instead of one
// overwriting the other's list.
function userThreadsKey(userId: string): string {
  return `${PREFIX}user_threads:${userId}`;
}

// Our own JSON, but one unreadable member must not take the index down: the
// point of the index is a bug report, and losing every thread because one entry
// is malformed loses exactly the report someone was filing.
function parseRef(member: string): UserThreadRef | null {
  try {
    return JSON.parse(member) as UserThreadRef;
  } catch (err) {
    console.error(`[conversations] skipping unreadable thread entry:`, err);
    return null;
  }
}

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

  async indexUserThread(userId: string, write: UserThreadWrite): Promise<void> {
    const key = userThreadsKey(userId);
    // The whole index, not just the page a reader gets: an entry past the cap
    // has not been evicted yet on this pass, and advancing it there rather than
    // adding a second one is what stops a thread appearing twice.
    const members = await this.client.zrevrange(key, 0, -1);
    // Removed by the exact string it was stored under — a re-serialization of
    // the parsed entry is not guaranteed to be the same bytes.
    const [first, ...rest] = members.filter((member) => {
      const ref = parseRef(member);
      return ref !== null && continuesThread(ref, write);
    });
    if (first !== undefined) await this.client.zrem(key, first, ...rest);
    await this.client.zadd(key, write.ts, JSON.stringify(userThreadRef(write)));
    // Rank 0 is the lowest score, so this drops everything below the newest
    // `USER_THREAD_INDEX_MAX` — including this write, if it is older than all
    // of them, which is exactly what "the last N threads" means.
    await this.client.zremrangebyrank(key, 0, -(USER_THREAD_INDEX_MAX + 1));
    // Refreshed on every write, so the index lives as long as the newest thread
    // it points at and never outlasts the nodes themselves.
    await this.client.expire(key, CONVERSATION_TTL_SECONDS);
  }

  async listUserThreads(userId: string): Promise<UserThreadRef[]> {
    const members = await this.client.zrevrange(
      userThreadsKey(userId),
      0,
      USER_THREAD_INDEX_MAX - 1,
    );
    const refs: UserThreadRef[] = [];
    for (const member of members) {
      const ref = parseRef(member);
      if (ref) refs.push(ref);
    }
    return refs;
  }
}
