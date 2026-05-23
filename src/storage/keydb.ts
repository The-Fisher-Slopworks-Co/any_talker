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
  RateLimitConfig,
} from "../shared/types";
import {
  CONVERSATION_TTL_SECONDS,
  PHOTO_CACHE_TTL_SECONDS,
  isEmptyChatSettings,
  isValidGender,
} from "../shared/types";
import { isValidLang, type Lang } from "../shared/i18n";
import type { Reminder } from "../reminders/types";
import {
  parseStoredReminder,
  ReminderParseError,
  type ReminderParseFailureReason,
} from "../reminders/parse";
import type { RecurringCheck } from "../checks/types";
import { remindersParseFailuresTotal } from "../metrics";

const PREFIX = "at:";
const FETCH_DUE_LIMIT = 100;

// Atomic refill: lazy refill identical to the in-process algorithm, but
// executed server-side so concurrent callers cannot interleave the
// read-modify-write cycle. Returns [tokens, lastRefillTs] as strings.
const REFILL_BUCKET_LUA = `
local raw = redis.call('GET', KEYS[1])
local capacity = tonumber(ARGV[1])
local refillAmount = tonumber(ARGV[2])
local refillIntervalMs = tonumber(ARGV[3])
local now = tonumber(ARGV[4])
local tokens
local lastRefillTs
if raw then
  local s = cjson.decode(raw)
  tokens = s.tokens
  lastRefillTs = s.lastRefillTs
  local elapsed = now - lastRefillTs
  if elapsed >= refillIntervalMs then
    local periods = math.floor(elapsed / refillIntervalMs)
    local refilled = tokens + periods * refillAmount
    if refilled > capacity then refilled = capacity end
    tokens = refilled
    lastRefillTs = lastRefillTs + periods * refillIntervalMs
  end
else
  tokens = capacity
  lastRefillTs = now
end
redis.call('SET', KEYS[1], cjson.encode({tokens = tokens, lastRefillTs = lastRefillTs}))
return {tostring(tokens), tostring(lastRefillTs)}
`;

// Atomic deduction: subtract `delta` tokens from the bucket in a single
// server-side step. Seeds a deficit bucket if no key exists, matching the
// behavior of the previous in-process implementation.
const DEDUCT_BUCKET_LUA = `
local raw = redis.call('GET', KEYS[1])
local delta = tonumber(ARGV[1])
local nowMs = tonumber(ARGV[2])
local tokens
local lastRefillTs
if raw then
  local s = cjson.decode(raw)
  tokens = s.tokens - delta
  lastRefillTs = s.lastRefillTs
else
  tokens = -delta
  lastRefillTs = nowMs
end
redis.call('SET', KEYS[1], cjson.encode({tokens = tokens, lastRefillTs = lastRefillTs}))
return {tostring(tokens), tostring(lastRefillTs)}
`;

function parseBucketEvalReply(reply: unknown): BucketState {
  if (!Array.isArray(reply) || reply.length !== 2) {
    throw new Error(
      `bucket EVAL returned unexpected shape: ${JSON.stringify(reply)}`,
    );
  }
  const tokens = Number(reply[0]);
  const lastRefillTs = Number(reply[1]);
  if (!Number.isFinite(tokens) || !Number.isFinite(lastRefillTs)) {
    throw new Error(
      `bucket EVAL returned non-numeric values: ${JSON.stringify(reply)}`,
    );
  }
  return { tokens, lastRefillTs };
}

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

  async refillBucket(
    chatId: string,
    userId: string,
    config: RateLimitConfig,
    now: number,
  ): Promise<BucketState> {
    const reply = await this.client.send("EVAL", [
      REFILL_BUCKET_LUA,
      "1",
      `${PREFIX}bucket:${chatId}:${userId}`,
      String(config.capacity),
      String(config.refillAmount),
      String(config.refillIntervalMs),
      String(now),
    ]);
    return parseBucketEvalReply(reply);
  }

  async deductBucket(
    chatId: string,
    userId: string,
    tokens: number,
    nowMs: number,
  ): Promise<BucketState> {
    const reply = await this.client.send("EVAL", [
      DEDUCT_BUCKET_LUA,
      "1",
      `${PREFIX}bucket:${chatId}:${userId}`,
      String(tokens),
      String(nowMs),
    ]);
    return parseBucketEvalReply(reply);
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

  async getUserOpenrouterKey(userId: string): Promise<string | null> {
    return await this.client.get(`${PREFIX}user_or_key:${userId}`);
  }

  async setUserOpenrouterKey(userId: string, key: string | null): Promise<void> {
    const k = `${PREFIX}user_or_key:${userId}`;
    if (key === null) await this.client.del(k);
    else await this.client.set(k, key);
  }

  async getUserOpenrouterModels(userId: string): Promise<string[] | null> {
    const raw = await this.client.get(`${PREFIX}user_or_models:${userId}`);
    if (raw === null) return null;
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (
        !Array.isArray(parsed) ||
        !parsed.every((m): m is string => typeof m === "string")
      ) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  async setUserOpenrouterModels(
    userId: string,
    models: string[] | null,
  ): Promise<void> {
    const k = `${PREFIX}user_or_models:${userId}`;
    if (models === null) await this.client.del(k);
    else await this.client.set(k, JSON.stringify(models));
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

  async getPhotoBytes(fileId: string): Promise<Uint8Array | null> {
    const key = `${PREFIX}photo_cache:${fileId}`;
    const raw = await this.client.get(key);
    if (raw === null) return null;
    // Renew TTL on access so hot photos stay cached longer than the original
    // 7-day window if the conversation chain keeps referencing them.
    await this.client.expire(key, PHOTO_CACHE_TTL_SECONDS).catch((err) => {
      console.error("photo cache expire renewal failed:", err);
    });
    return new Uint8Array(Buffer.from(raw, "base64"));
  }

  async savePhotoBytes(fileId: string, bytes: Uint8Array): Promise<void> {
    const key = `${PREFIX}photo_cache:${fileId}`;
    const b64 = Buffer.from(bytes).toString("base64");
    await this.client.set(key, b64);
    await this.client.expire(key, PHOTO_CACHE_TTL_SECONDS);
  }

  async appendAlbumPhoto(
    chatId: string,
    mediaGroupId: string,
    photo: { messageId: number; fileId: string },
  ): Promise<void> {
    const key = `${PREFIX}album:${chatId}:${mediaGroupId}`;
    await this.client.hset(key, String(photo.messageId), photo.fileId);
    await this.client.expire(key, CONVERSATION_TTL_SECONDS);
  }

  async getAlbumPhotos(
    chatId: string,
    mediaGroupId: string,
  ): Promise<Array<{ messageId: number; fileId: string }>> {
    const key = `${PREFIX}album:${chatId}:${mediaGroupId}`;
    const all = await this.client.hgetall(key);
    const out: Array<{ messageId: number; fileId: string }> = [];
    for (const [field, value] of Object.entries(all)) {
      const messageId = Number(field);
      if (Number.isFinite(messageId)) out.push({ messageId, fileId: value });
    }
    return out;
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
    const corrupted: Array<{ id: string; reason: ReminderParseFailureReason }> = [];
    for (let i = 0; i < ids.length; i++) {
      const raw = raws[i];
      if (raw === null || raw === undefined) {
        orphans.push(ids[i]!);
        continue;
      }
      try {
        out.push(parseStoredReminder(raw));
      } catch (err) {
        if (err instanceof ReminderParseError) {
          corrupted.push({ id: ids[i]!, reason: err.reason });
          console.error(
            `[reminders] quarantining corrupted reminder id=${ids[i]} reason=${err.reason}:`,
            err.cause,
          );
        } else {
          throw err;
        }
      }
    }
    // Quarantine corrupted records on the due path: deleting the payload +
    // zrem from the due set prevents the next tick from picking them up and
    // looping forever. user_reminders may briefly hold a dangling id;
    // listRemindersForUser tolerates that (MGET nulls are skipped).
    for (const { id, reason } of corrupted) {
      remindersParseFailuresTotal.inc({ reason });
      await this.client
        .del(`${PREFIX}reminder:${id}`)
        .catch((err) =>
          console.error("quarantine del payload failed:", err),
        );
      orphans.push(id);
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
      try {
        out.push(parseStoredReminder(raw));
      } catch (err) {
        if (err instanceof ReminderParseError) {
          remindersParseFailuresTotal.inc({ reason: err.reason });
          console.error(
            `[reminders] skipping corrupted reminder id=${ids[i]} reason=${err.reason}:`,
            err.cause,
          );
          continue;
        }
        throw err;
      }
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
      try {
        out.push(parseStoredReminder(raw));
      } catch (err) {
        if (err instanceof ReminderParseError) {
          remindersParseFailuresTotal.inc({ reason: err.reason });
          console.error(
            `[reminders] skipping corrupted reminder id=${ids[i]} reason=${err.reason}:`,
            err.cause,
          );
          continue;
        }
        throw err;
      }
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
