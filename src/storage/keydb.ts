// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { RedisClient } from "bun";
import type { Storage } from "./types";
import type {
  Settings,
  WhitelistEntry,
  WhitelistKind,
  BucketState,
  ConversationNode,
  GuestThreadNode,
  User,
  Chat,
  ChatSettings,
  Gender,
} from "../shared/types";
import {
  CONVERSATION_TTL_SECONDS,
  isEmptyChatSettings,
  isValidGender,
} from "../shared/types";
import { DEFAULT_LANG, isValidLang, type Lang } from "../shared/i18n";
import type { Reminder } from "../reminders/types";
import type { RecurringCheck } from "../checks/types";

const PREFIX = "at:";
const FETCH_DUE_LIMIT = 100;

export class KeyDBStorage implements Storage {
  constructor(private readonly client: RedisClient) {}

  static async connect(url: string): Promise<KeyDBStorage> {
    const client = new RedisClient(url);
    await client.connect();
    return new KeyDBStorage(client);
  }

  async getSettings(): Promise<Settings | null> {
    const raw = await this.client.get(`${PREFIX}settings`);
    return raw ? (JSON.parse(raw) as Settings) : null;
  }

  async saveSettings(settings: Settings): Promise<void> {
    await this.client.set(`${PREFIX}settings`, JSON.stringify(settings));
  }

  async listWhitelist(kind: WhitelistKind): Promise<WhitelistEntry[]> {
    const raw = await this.client.get(`${PREFIX}whitelist:${kind}`);
    return raw ? (JSON.parse(raw) as WhitelistEntry[]) : [];
  }

  async addWhitelist(kind: WhitelistKind, entry: WhitelistEntry): Promise<void> {
    const list = await this.listWhitelist(kind);
    const next = [...list.filter((e) => e.id !== entry.id), { ...entry }];
    await this.client.set(`${PREFIX}whitelist:${kind}`, JSON.stringify(next));
  }

  async removeWhitelist(kind: WhitelistKind, id: string): Promise<void> {
    const list = await this.listWhitelist(kind);
    const next = list.filter((e) => e.id !== id);
    await this.client.set(`${PREFIX}whitelist:${kind}`, JSON.stringify(next));
  }

  async isWhitelisted(kind: WhitelistKind, id: string): Promise<boolean> {
    const list = await this.listWhitelist(kind);
    return list.some((e) => e.id === id);
  }

  async getBucket(chatId: string, userId: string): Promise<BucketState | null> {
    const raw = await this.client.get(`${PREFIX}bucket:${chatId}:${userId}`);
    return raw ? (JSON.parse(raw) as BucketState) : null;
  }

  async saveBucket(
    chatId: string,
    userId: string,
    state: BucketState,
  ): Promise<void> {
    await this.client.set(
      `${PREFIX}bucket:${chatId}:${userId}`,
      JSON.stringify(state),
    );
  }

  async getUserName(userId: string): Promise<string | null> {
    return await this.client.get(`${PREFIX}user_name:${userId}`);
  }

  async setUserName(userId: string, name: string | null): Promise<void> {
    const key = `${PREFIX}user_name:${userId}`;
    if (name === null) await this.client.del(key);
    else await this.client.set(key, name);
  }

  async getUserTimezone(userId: string): Promise<string | null> {
    return await this.client.get(`${PREFIX}user_tz:${userId}`);
  }

  async setUserTimezone(userId: string, timezone: string | null): Promise<void> {
    const key = `${PREFIX}user_tz:${userId}`;
    if (timezone === null) await this.client.del(key);
    else await this.client.set(key, timezone);
  }

  async getUserGender(userId: string): Promise<Gender | null> {
    const raw = await this.client.get(`${PREFIX}user_gender:${userId}`);
    return isValidGender(raw) ? raw : null;
  }

  async setUserGender(userId: string, gender: Gender | null): Promise<void> {
    const key = `${PREFIX}user_gender:${userId}`;
    if (gender === null) await this.client.del(key);
    else await this.client.set(key, gender);
  }

  async getUserLang(userId: string): Promise<Lang | null> {
    const raw = await this.client.get(`${PREFIX}user_lang:${userId}`);
    return isValidLang(raw) ? raw : null;
  }

  async setUserLang(userId: string, lang: Lang | null): Promise<void> {
    const key = `${PREFIX}user_lang:${userId}`;
    if (lang === null) await this.client.del(key);
    else await this.client.set(key, lang);
  }

  async listUsers(): Promise<User[]> {
    const values = await this.client.hvals(`${PREFIX}users`);
    return values
      .map((raw) => JSON.parse(raw) as User)
      .sort((a, b) => b.lastSeenAt - a.lastSeenAt);
  }

  async upsertUser(user: User): Promise<void> {
    await this.client.hset(`${PREFIX}users`, user.id, JSON.stringify(user));
  }

  async getUser(id: string): Promise<User | null> {
    const raw = await this.client.hget(`${PREFIX}users`, id);
    return raw ? (JSON.parse(raw) as User) : null;
  }

  async listChats(): Promise<Chat[]> {
    const values = await this.client.hvals(`${PREFIX}chats`);
    return values
      .map((raw) => JSON.parse(raw) as Chat)
      .sort((a, b) => b.lastSeenAt - a.lastSeenAt);
  }

  async upsertChat(chat: Chat): Promise<void> {
    await this.client.hset(`${PREFIX}chats`, chat.id, JSON.stringify(chat));
  }

  async getChat(id: string): Promise<Chat | null> {
    const raw = await this.client.hget(`${PREFIX}chats`, id);
    return raw ? (JSON.parse(raw) as Chat) : null;
  }

  async getChatSettings(chatId: string): Promise<ChatSettings | null> {
    const raw = await this.client.get(`${PREFIX}chat_settings:${chatId}`);
    return raw ? (JSON.parse(raw) as ChatSettings) : null;
  }

  async saveChatSettings(chatId: string, settings: ChatSettings): Promise<void> {
    const key = `${PREFIX}chat_settings:${chatId}`;
    if (isEmptyChatSettings(settings)) {
      await this.client.del(key);
      return;
    }
    await this.client.set(key, JSON.stringify(settings));
  }

  async getConversation(chatId: string, botMsgId: number): Promise<ConversationNode | null> {
    const raw = await this.client.get(`${PREFIX}msg:${chatId}:${botMsgId}`);
    return raw ? (JSON.parse(raw) as ConversationNode) : null;
  }

  async saveConversation(
    chatId: string,
    botMsgId: number,
    node: ConversationNode,
  ): Promise<void> {
    const key = `${PREFIX}msg:${chatId}:${botMsgId}`;
    await this.client.set(key, JSON.stringify(node));
    await this.client.expire(key, CONVERSATION_TTL_SECONDS);
  }

  async getGuestThread(chatId: string): Promise<GuestThreadNode | null> {
    const raw = await this.client.get(`${PREFIX}guest_thread:${chatId}`);
    return raw ? (JSON.parse(raw) as GuestThreadNode) : null;
  }

  async saveGuestThread(chatId: string, thread: GuestThreadNode): Promise<void> {
    const key = `${PREFIX}guest_thread:${chatId}`;
    await this.client.set(key, JSON.stringify(thread));
    await this.client.expire(key, CONVERSATION_TTL_SECONDS);
  }

  async saveReminder(reminder: Reminder): Promise<void> {
    // ZSET first so a crash leaves an orphan fetchDueReminders can GC;
    // payload-first would leak blobs no scheduler tick ever discovers.
    await this.client.zadd(
      `${PREFIX}reminders:due`,
      reminder.fireAtMs,
      reminder.id,
    );
    await this.client.set(
      `${PREFIX}reminder:${reminder.id}`,
      JSON.stringify(reminder),
    );
    await this.client.sadd(
      `${PREFIX}user_reminders:${reminder.userId}`,
      reminder.id,
    );
  }

  async fetchDueReminders(nowMs: number): Promise<Reminder[]> {
    // Cap per-tick batch so a backlog after an outage drains over multiple
    // ticks instead of fanning out into one thundering Telegram-API herd.
    const ids = await this.client.zrangebyscore(
      `${PREFIX}reminders:due`,
      0,
      nowMs,
      "LIMIT",
      0,
      FETCH_DUE_LIMIT,
    );
    if (ids.length === 0) return [];
    const keys = ids.map((id) => `${PREFIX}reminder:${id}`);
    const raws = await this.client.mget(...keys);
    const out: Reminder[] = [];
    const orphans: string[] = [];
    for (let i = 0; i < ids.length; i++) {
      const raw = raws[i];
      if (raw === null || raw === undefined) {
        orphans.push(ids[i]!);
        continue;
      }
      out.push(parseReminderJson(raw));
    }
    if (orphans.length > 0) {
      await this.client
        .zrem(`${PREFIX}reminders:due`, orphans[0]!, ...orphans.slice(1))
        .catch((err) =>
          console.error("zrem orphan reminders failed:", err),
        );
    }
    return out;
  }

  async listRemindersForUser(userId: string): Promise<Reminder[]> {
    const ids = await this.client.smembers(`${PREFIX}user_reminders:${userId}`);
    if (ids.length === 0) return [];
    const keys = ids.map((id) => `${PREFIX}reminder:${id}`);
    const raws = await this.client.mget(...keys);
    const out: Reminder[] = [];
    for (let i = 0; i < ids.length; i++) {
      const raw = raws[i];
      if (raw === null || raw === undefined) continue;
      out.push(parseReminderJson(raw));
    }
    return out.sort((a, b) => a.fireAtMs - b.fireAtMs);
  }

  async listAllReminders(): Promise<Reminder[]> {
    const ids = await this.client.zrange(
      `${PREFIX}reminders:due`,
      0,
      -1,
    );
    if (ids.length === 0) return [];
    const keys = ids.map((id) => `${PREFIX}reminder:${id}`);
    const raws = await this.client.mget(...keys);
    const out: Reminder[] = [];
    for (let i = 0; i < ids.length; i++) {
      const raw = raws[i];
      if (raw === null || raw === undefined) continue;
      out.push(parseReminderJson(raw));
    }
    return out.sort((a, b) => a.fireAtMs - b.fireAtMs);
  }

  async deleteReminder(id: string, userId: string): Promise<void> {
    // Payload first so a crash leaves a ZSET orphan fetchDueReminders can GC;
    // index-first would leak a payload key (no TTL). user_reminders may
    // briefly reference a deleted id; listRemindersForUser skips MGET nulls.
    await this.client.del(`${PREFIX}reminder:${id}`);
    await this.client.zrem(`${PREFIX}reminders:due`, id);
    await this.client.srem(`${PREFIX}user_reminders:${userId}`, id);
  }

  async recordPrivateChat(userId: string): Promise<void> {
    await this.client.set(`${PREFIX}user_private_chat:${userId}`, "1");
  }

  async userHasPrivateChat(userId: string): Promise<boolean> {
    const v = await this.client.get(`${PREFIX}user_private_chat:${userId}`);
    return v !== null;
  }

  async saveCheck(check: RecurringCheck): Promise<void> {
    await this.client.hset(
      `${PREFIX}checks`,
      check.id,
      JSON.stringify(check),
    );
  }

  async getCheck(id: string): Promise<RecurringCheck | null> {
    const raw = await this.client.hget(`${PREFIX}checks`, id);
    return raw ? parseCheckJson(raw) : null;
  }

  async listChecks(): Promise<RecurringCheck[]> {
    const values = await this.client.hvals(`${PREFIX}checks`);
    return values
      .map(parseCheckJson)
      .sort((a, b) => a.createdAtMs - b.createdAtMs);
  }

  async deleteCheck(id: string): Promise<void> {
    await this.client.hdel(`${PREFIX}checks`, id);
  }
}

// Backfill defaults for fields added after the initial schema so legacy
// records load with runtime types matching the static type.
function parseCheckJson(raw: string): RecurringCheck {
  const parsed = JSON.parse(raw) as RecurringCheck;
  return { ...parsed, counterAnchorDate: parsed.counterAnchorDate ?? null };
}

function parseReminderJson(raw: string): Reminder {
  const parsed = JSON.parse(raw) as Reminder & {
    chatId?: string;
    lang?: string;
    contextMessages?: unknown;
  };
  const chatId =
    parsed.chatId ??
    (parsed.target.kind === "ask_reply"
      ? parsed.target.chatId
      : parsed.target.userId);
  const lang: Lang = isValidLang(parsed.lang) ? parsed.lang : DEFAULT_LANG;
  const contextMessages = Array.isArray(parsed.contextMessages)
    ? (parsed.contextMessages as Reminder["contextMessages"])
    : [];
  return { ...parsed, chatId, lang, contextMessages };
}
