// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { RedisClient } from "bun";
import type { Storage } from "./types";
import { USER_FACTS_MAX_PER_USER } from "./types";
import type {
  Settings,
  WhitelistEntry,
  WhitelistKind,
  UserUsage,
  ConversationNode,
  GuestThreadNode,
  User,
  Chat,
  ChatSettings,
  Gender,
} from "../shared/types";
import {
  CONVERSATION_TTL_SECONDS,
  PHOTO_CACHE_TTL_SECONDS,
  isEmptyChatSettings,
  isValidGender,
} from "../shared/types";
import { USAGE_RETENTION_SECONDS } from "../ratelimit/window";
import { isValidLang, type Lang } from "../shared/i18n";
import type { Reminder } from "../reminders/types";
import {
  parseStoredReminder,
  ReminderParseError,
  type ReminderParseFailureReason,
} from "../reminders/parse";
import type { RecurringCheck } from "../checks/types";
import type { ManagedBot } from "../managed-bots/types";
import { photoCacheErrorsTotal, remindersParseFailuresTotal } from "../metrics";
import type { SpendSummary } from "../spending/window";
import {
  SPEND_RETENTION_DAYS,
  SPEND_WINDOW_DAYS,
  recentUtcDateKeys,
  summarizeSpend,
  utcDateKey,
} from "../spending/window";

const PREFIX = "at:";
const FETCH_DUE_LIMIT = 100;

// Atomic usage accrual for the dual fixed-window limiter. The caller passes the
// current start of each window (computed from the user's deterministic phase
// offset); a stored window whose start differs has rolled over, so its `used`
// restarts at the new tokens instead of accumulating. Runs server-side so
// concurrent requests can't interleave the read-modify-write. Returns
// [fiveUsed, weeklyUsed, fiveStart, weeklyStart] as strings.
const ADD_USAGE_LUA = `
local raw = redis.call('GET', KEYS[1])
local fiveStart = tonumber(ARGV[1])
local weekStart = tonumber(ARGV[2])
local tokens = tonumber(ARGV[3])
local ttl = tonumber(ARGV[4])
local fiveUsed = tokens
local weekUsed = tokens
if raw then
  local s = cjson.decode(raw)
  if s.fiveHour and s.fiveHour.windowStart == fiveStart then
    fiveUsed = s.fiveHour.used + tokens
  end
  if s.weekly and s.weekly.windowStart == weekStart then
    weekUsed = s.weekly.used + tokens
  end
end
redis.call('SET', KEYS[1], cjson.encode({
  fiveHour = {windowStart = fiveStart, used = fiveUsed},
  weekly = {windowStart = weekStart, used = weekUsed}
}))
if ttl > 0 then redis.call('EXPIRE', KEYS[1], ttl) end
return {tostring(fiveUsed), tostring(weekUsed), tostring(fiveStart), tostring(weekStart)}
`;

// Atomic upsert with cap check: HSET if the field already exists or the
// hash is under the cap; otherwise return a sentinel. Executes server-side
// so concurrent callers cannot race the HLEN/HSET pair. Returns "1" on
// success, "0" when the limit was reached.
const REMEMBER_FACT_LUA = `
local exists = redis.call('HEXISTS', KEYS[1], ARGV[1])
if exists == 0 then
  local len = redis.call('HLEN', KEYS[1])
  if len >= tonumber(ARGV[3]) then
    -- At the cap with a NEW key: evict the oldest fact to make room rather than
    -- rejecting the write. HKEYS preserves field insertion order for the
    -- listpack encoding small hashes use (cap 50 < hash-max-listpack-entries
    -- default 128), so keys[1] is the oldest-inserted fact.
    local keys = redis.call('HKEYS', KEYS[1])
    redis.call('HDEL', KEYS[1], keys[1])
  end
end
redis.call('HSET', KEYS[1], ARGV[1], ARGV[2])
return '1'
`;

function parseUsageEvalReply(reply: unknown): UserUsage {
  if (!Array.isArray(reply) || reply.length !== 4) {
    throw new Error(
      `usage EVAL returned unexpected shape: ${JSON.stringify(reply)}`,
    );
  }
  const fiveUsed = Number(reply[0]);
  const weekUsed = Number(reply[1]);
  const fiveStart = Number(reply[2]);
  const weekStart = Number(reply[3]);
  if (
    !Number.isFinite(fiveUsed) ||
    !Number.isFinite(weekUsed) ||
    !Number.isFinite(fiveStart) ||
    !Number.isFinite(weekStart)
  ) {
    throw new Error(
      `usage EVAL returned non-numeric values: ${JSON.stringify(reply)}`,
    );
  }
  return {
    fiveHour: { windowStart: fiveStart, used: fiveUsed },
    weekly: { windowStart: weekStart, used: weekUsed },
  };
}

// REMEMBER_FACT_LUA now always returns the bulk string '1' (a new key at the
// cap evicts the oldest instead of being rejected), but the '0' →
// limit_reached mapping is kept for API stability. Validate defensively: any
// other reply shape (Buffer, RESP3 verbatim string, null on a transient error
// path) must throw rather than silently masquerading as a known result.
export function parseRememberFactReply(
  reply: unknown,
): { ok: true } | { ok: false; reason: "limit_reached" } {
  if (reply === "1" || reply === 1) return { ok: true };
  if (reply === "0" || reply === 0) {
    return { ok: false, reason: "limit_reached" };
  }
  throw new Error(
    `Unexpected EVAL reply for rememberUserFact: ${JSON.stringify(reply)}`,
  );
}

// User/chat rows written before `firstSeenAt` existed have no such field; treat
// a missing value as epoch 0 so an existing entity is never mistaken for "new"
// (which would wrongly apply the new-user budget or surface it in the digest).
function withFirstSeen<T extends { firstSeenAt: number }>(rec: T): T {
  if (typeof rec.firstSeenAt !== "number") {
    (rec as { firstSeenAt: number }).firstSeenAt = 0;
  }
  return rec;
}

export class KeyDBStorage implements Storage {
  // `botPrefix` is "" for the main bot (legacy unprefixed keys) or
  // `mbot:{botId}:` for a managed bot. It is interposed between the global
  // `at:` prefix and the entity segment for per-character data only.
  constructor(
    private readonly client: RedisClient,
    private readonly botPrefix: string = "",
  ) {}

  static async connect(url: string): Promise<KeyDBStorage> {
    const client = new RedisClient(url);
    await client.connect();
    return new KeyDBStorage(client);
  }

  forBot(botId: string | null): Storage {
    const prefix = botId ? `mbot:${botId}:` : "";
    if (prefix === this.botPrefix) return this;
    return new KeyDBStorage(this.client, prefix);
  }

  // Build a per-character-scoped key. `forBot(null)` keeps `botPrefix === ""`,
  // so this is byte-identical to the original `${PREFIX}${base}` for the main
  // bot; a managed bot inserts its `mbot:{botId}:` segment.
  private sk(base: string): string {
    return `${PREFIX}${this.botPrefix}${base}`;
  }

  async listManagedBots(): Promise<ManagedBot[]> {
    const values = await this.client.hvals(`${PREFIX}managed_bots`);
    return values
      .map((raw) => JSON.parse(raw) as ManagedBot)
      .sort((a, b) => a.createdAtMs - b.createdAtMs);
  }

  async getManagedBot(botId: string): Promise<ManagedBot | null> {
    const raw = await this.client.hget(`${PREFIX}managed_bots`, botId);
    return raw ? (JSON.parse(raw) as ManagedBot) : null;
  }

  async saveManagedBot(bot: ManagedBot): Promise<void> {
    await this.client.hset(
      `${PREFIX}managed_bots`,
      bot.botId,
      JSON.stringify(bot),
    );
  }

  async deleteManagedBot(botId: string): Promise<void> {
    await this.client.hdel(`${PREFIX}managed_bots`, botId);
  }

  async getManagedBotToken(botId: string): Promise<string | null> {
    return await this.client.get(`${PREFIX}managed_bot_token:${botId}`);
  }

  async setManagedBotToken(botId: string, token: string | null): Promise<void> {
    const key = `${PREFIX}managed_bot_token:${botId}`;
    if (token === null) await this.client.del(key);
    else await this.client.set(key, token);
  }

  // Presence is a shared registry (unscoped, like `managed_bots`): every bot —
  // main and managed — records its own membership under the same per-chat hash,
  // field = bot id, value = last-seen epoch ms. TTL pruning is the reader's job.
  async recordBotPresence(
    chatId: string,
    botId: string,
    atMs: number,
  ): Promise<void> {
    await this.client.hset(
      `${PREFIX}bot_presence:${chatId}`,
      botId,
      String(atMs),
    );
  }

  async removeBotPresence(chatId: string, botId: string): Promise<void> {
    await this.client.hdel(`${PREFIX}bot_presence:${chatId}`, botId);
  }

  async getBotPresence(chatId: string): Promise<Record<string, number>> {
    const raw = await this.client.hgetall(`${PREFIX}bot_presence:${chatId}`);
    const out: Record<string, number> = {};
    for (const [botId, ms] of Object.entries(raw)) {
      const n = Number(ms);
      if (Number.isFinite(n)) out[botId] = n;
    }
    return out;
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

  // Usage is a shared per-user key (unscoped, like spend): the budget is global,
  // not per chat or per character bot.
  async getUserUsage(userId: string): Promise<UserUsage | null> {
    const raw = await this.client.get(`${PREFIX}usage:${userId}`);
    return raw ? (JSON.parse(raw) as UserUsage) : null;
  }

  async addUserUsage(
    userId: string,
    tokens: number,
    fiveHourWindowStart: number,
    weeklyWindowStart: number,
  ): Promise<UserUsage> {
    const reply = await this.client.send("EVAL", [
      ADD_USAGE_LUA,
      "1",
      `${PREFIX}usage:${userId}`,
      String(fiveHourWindowStart),
      String(weeklyWindowStart),
      String(tokens),
      String(USAGE_RETENTION_SECONDS),
    ]);
    return parseUsageEvalReply(reply);
  }

  async resetUserUsage(userId: string): Promise<void> {
    await this.client.del(`${PREFIX}usage:${userId}`);
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

  // Accrue a positive cost into `{keyPrefix}:{date}` (a float counter) and renew
  // its retention TTL. Shared by the user/chat/global/model spend ledgers.
  private async accrueSpend(
    keyPrefix: string,
    costUsd: number,
    nowMs: number,
  ): Promise<void> {
    const key = `${keyPrefix}:${utcDateKey(nowMs)}`;
    await this.client.send("INCRBYFLOAT", [key, String(costUsd)]);
    await this.client.expire(key, SPEND_RETENTION_DAYS * 24 * 60 * 60);
  }

  // Read the trailing day/week/month windows for a `{keyPrefix}:{date}` ledger.
  private async readSpend(
    keyPrefix: string,
    nowMs: number,
  ): Promise<SpendSummary> {
    const dates = recentUtcDateKeys(nowMs, SPEND_WINDOW_DAYS.month);
    const raws = await this.client.mget(...dates.map((d) => `${keyPrefix}:${d}`));
    const byDate: Record<string, number> = {};
    for (let i = 0; i < dates.length; i++) {
      const raw = raws[i];
      const n = raw === null || raw === undefined ? 0 : Number(raw);
      byDate[dates[i]!] = Number.isFinite(n) ? n : 0;
    }
    return summarizeSpend(byDate, nowMs);
  }

  // Record an id in the day's active-spender set (TTL 2 days — only the spike
  // scan reads it, and only for today).
  private async markActive(
    kind: "user" | "chat",
    id: string,
    nowMs: number,
  ): Promise<void> {
    const key = `${PREFIX}spend_active:${kind}:${utcDateKey(nowMs)}`;
    await this.client.send("SADD", [key, id]);
    await this.client.expire(key, 2 * 24 * 60 * 60);
  }

  async addUserSpend(
    userId: string,
    costUsd: number,
    nowMs: number,
  ): Promise<void> {
    if (!(costUsd > 0)) return;
    await this.accrueSpend(`${PREFIX}spend:${userId}`, costUsd, nowMs);
    await this.markActive("user", userId, nowMs);
  }

  async getUserSpend(userId: string, nowMs: number): Promise<SpendSummary> {
    return this.readSpend(`${PREFIX}spend:${userId}`, nowMs);
  }

  async addChatSpend(
    chatId: string,
    costUsd: number,
    nowMs: number,
  ): Promise<void> {
    if (!(costUsd > 0)) return;
    await this.accrueSpend(`${PREFIX}spend_chat:${chatId}`, costUsd, nowMs);
    await this.markActive("chat", chatId, nowMs);
  }

  async getChatSpend(chatId: string, nowMs: number): Promise<SpendSummary> {
    return this.readSpend(`${PREFIX}spend_chat:${chatId}`, nowMs);
  }

  async addGlobalSpend(costUsd: number, nowMs: number): Promise<void> {
    if (!(costUsd > 0)) return;
    await this.accrueSpend(`${PREFIX}spend_global`, costUsd, nowMs);
  }

  async getGlobalSpend(nowMs: number): Promise<SpendSummary> {
    return this.readSpend(`${PREFIX}spend_global`, nowMs);
  }

  async addModelSpend(
    modelId: string,
    costUsd: number,
    nowMs: number,
  ): Promise<void> {
    if (!(costUsd > 0)) return;
    await this.accrueSpend(`${PREFIX}spend_model:${modelId}`, costUsd, nowMs);
    await this.client.send("SADD", [`${PREFIX}spend_models`, modelId]);
  }

  async getModelSpend(modelId: string, nowMs: number): Promise<SpendSummary> {
    return this.readSpend(`${PREFIX}spend_model:${modelId}`, nowMs);
  }

  async listSpendModels(): Promise<string[]> {
    const reply = await this.client.send("SMEMBERS", [`${PREFIX}spend_models`]);
    return Array.isArray(reply) ? reply.map(String) : [];
  }

  async flagUnpricedModel(modelId: string): Promise<void> {
    await this.client.send("SADD", [`${PREFIX}unpriced_models`, modelId]);
  }

  async listUnpricedModels(): Promise<string[]> {
    const reply = await this.client.send("SMEMBERS", [
      `${PREFIX}unpriced_models`,
    ]);
    return Array.isArray(reply) ? reply.map(String) : [];
  }

  async listSpendActiveEntities(
    kind: "user" | "chat",
    nowMs: number,
  ): Promise<string[]> {
    const key = `${PREFIX}spend_active:${kind}:${utcDateKey(nowMs)}`;
    const reply = await this.client.send("SMEMBERS", [key]);
    return Array.isArray(reply) ? reply.map(String) : [];
  }

  async incrementDenialCount(userId: string, nowMs: number): Promise<void> {
    const key = `${PREFIX}denial_rank:${utcDateKey(nowMs)}`;
    await this.client.send("ZINCRBY", [key, "1", userId]);
    await this.client.expire(key, 9 * 24 * 60 * 60);
  }

  async topDenied(
    nowMs: number,
    limit: number,
  ): Promise<Array<{ userId: string; count: number }>> {
    const n = Math.max(0, Math.floor(limit));
    if (n === 0) return [];
    const key = `${PREFIX}denial_rank:${utcDateKey(nowMs)}`;
    const reply = await this.client.send("ZREVRANGE", [
      key,
      "0",
      String(n - 1),
      "WITHSCORES",
    ]);
    const flat = Array.isArray(reply) ? reply : [];
    const out: Array<{ userId: string; count: number }> = [];
    for (let i = 0; i + 1 < flat.length; i += 2) {
      const count = Number(flat[i + 1]);
      if (Number.isFinite(count)) out.push({ userId: String(flat[i]), count });
    }
    return out;
  }

  async getDigestState(): Promise<{ lastSentAtMs: number } | null> {
    const raw = await this.client.get(`${PREFIX}digest_state`);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as { lastSentAtMs?: unknown };
      return typeof parsed.lastSentAtMs === "number"
        ? { lastSentAtMs: parsed.lastSentAtMs }
        : null;
    } catch {
      return null;
    }
  }

  async setDigestState(state: { lastSentAtMs: number }): Promise<void> {
    await this.client.set(`${PREFIX}digest_state`, JSON.stringify(state));
  }

  async claimAlert(key: string, ttlSeconds: number): Promise<boolean> {
    const reply = await this.client.send("SET", [
      `${PREFIX}alert_claim:${key}`,
      "1",
      "NX",
      "EX",
      String(Math.max(1, Math.floor(ttlSeconds))),
    ]);
    return reply === "OK";
  }

  async listUsers(): Promise<User[]> {
    const values = await this.client.hvals(`${PREFIX}users`);
    return values
      .map((raw) => withFirstSeen(JSON.parse(raw) as User))
      .sort((a, b) => b.lastSeenAt - a.lastSeenAt);
  }

  // Non-atomic read-merge (like the fire-and-forget upserts that call it): keep
  // the stored `firstSeenAt` if the row exists, else stamp the caller's. A rare
  // concurrent double-insert may report `isNew` twice, which downstream tolerates
  // (the new-group alert is `claimAlert`-deduped; the digest is firstSeenAt-derived).
  async upsertUser(user: User): Promise<{ isNew: boolean }> {
    const existingRaw = await this.client.hget(`${PREFIX}users`, user.id);
    const prev = existingRaw
      ? withFirstSeen(JSON.parse(existingRaw) as User)
      : null;
    const record: User = {
      ...user,
      firstSeenAt: prev ? prev.firstSeenAt : user.firstSeenAt,
    };
    await this.client.hset(`${PREFIX}users`, user.id, JSON.stringify(record));
    return { isNew: prev === null };
  }

  async getUser(id: string): Promise<User | null> {
    const raw = await this.client.hget(`${PREFIX}users`, id);
    return raw ? withFirstSeen(JSON.parse(raw) as User) : null;
  }

  async listChats(): Promise<Chat[]> {
    const values = await this.client.hvals(`${PREFIX}chats`);
    return values
      .map((raw) => withFirstSeen(JSON.parse(raw) as Chat))
      .sort((a, b) => b.lastSeenAt - a.lastSeenAt);
  }

  async upsertChat(chat: Chat): Promise<{ isNew: boolean }> {
    const existingRaw = await this.client.hget(`${PREFIX}chats`, chat.id);
    const prev = existingRaw
      ? withFirstSeen(JSON.parse(existingRaw) as Chat)
      : null;
    const record: Chat = {
      ...chat,
      firstSeenAt: prev ? prev.firstSeenAt : chat.firstSeenAt,
    };
    await this.client.hset(`${PREFIX}chats`, chat.id, JSON.stringify(record));
    return { isNew: prev === null };
  }

  async getChat(id: string): Promise<Chat | null> {
    const raw = await this.client.hget(`${PREFIX}chats`, id);
    return raw ? withFirstSeen(JSON.parse(raw) as Chat) : null;
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
    const raw = await this.client.get(this.sk(`msg:${chatId}:${botMsgId}`));
    return raw ? (JSON.parse(raw) as ConversationNode) : null;
  }

  async saveConversation(
    chatId: string,
    botMsgId: number,
    node: ConversationNode,
  ): Promise<void> {
    const key = this.sk(`msg:${chatId}:${botMsgId}`);
    await this.client.set(key, JSON.stringify(node));
    await this.client.expire(key, CONVERSATION_TTL_SECONDS);
  }

  async getPhotoBytes(fileId: string): Promise<Uint8Array | null> {
    const key = `${PREFIX}photo_cache:${fileId}`;
    const raw = await this.client.get(key);
    if (raw === null) return null;
    // Renew TTL on access so hot photos stay cached longer than the original
    // 7-day window if the conversation chain keeps referencing them. A
    // renewal failure is logged and counted, not raised: the photo bytes
    // are already in hand, premature eviction is the worst case.
    await this.client.expire(key, PHOTO_CACHE_TTL_SECONDS).catch((err) => {
      console.error("photo cache expire renewal failed:", err);
      photoCacheErrorsTotal.inc({ op: "ttl" });
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
    const key = this.sk(`album:${chatId}:${mediaGroupId}`);
    await this.client.hset(key, String(photo.messageId), photo.fileId);
    await this.client.expire(key, CONVERSATION_TTL_SECONDS);
  }

  async getAlbumPhotos(
    chatId: string,
    mediaGroupId: string,
  ): Promise<Array<{ messageId: number; fileId: string }>> {
    const key = this.sk(`album:${chatId}:${mediaGroupId}`);
    const all = await this.client.hgetall(key);
    const out: Array<{ messageId: number; fileId: string }> = [];
    for (const [field, value] of Object.entries(all)) {
      const messageId = Number(field);
      if (Number.isFinite(messageId)) out.push({ messageId, fileId: value });
    }
    return out;
  }

  async getGuestThread(chatId: string): Promise<GuestThreadNode | null> {
    const raw = await this.client.get(this.sk(`guest_thread:${chatId}`));
    return raw ? (JSON.parse(raw) as GuestThreadNode) : null;
  }

  async saveGuestThread(chatId: string, thread: GuestThreadNode): Promise<void> {
    const key = this.sk(`guest_thread:${chatId}`);
    await this.client.set(key, JSON.stringify(thread));
    await this.client.expire(key, CONVERSATION_TTL_SECONDS);
  }

  async saveReminder(reminder: Reminder): Promise<void> {
    // ZSET first so a crash leaves an orphan fetchDueReminders can GC;
    // payload-first would leak blobs no scheduler tick ever discovers.
    await this.client.zadd(
      this.sk("reminders:due"),
      reminder.fireAtMs,
      reminder.id,
    );
    await this.client.set(
      this.sk(`reminder:${reminder.id}`),
      JSON.stringify(reminder),
    );
    await this.client.sadd(
      this.sk(`user_reminders:${reminder.userId}`),
      reminder.id,
    );
  }

  async fetchDueReminders(nowMs: number): Promise<Reminder[]> {
    // Cap per-tick batch so a backlog after an outage drains over multiple
    // ticks instead of fanning out into one thundering Telegram-API herd.
    const ids = await this.client.zrangebyscore(
      this.sk("reminders:due"),
      0,
      nowMs,
      "LIMIT",
      0,
      FETCH_DUE_LIMIT,
    );
    if (ids.length === 0) return [];
    const keys = ids.map((id) => this.sk(`reminder:${id}`));
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
        .del(this.sk(`reminder:${id}`))
        .catch((err) =>
          console.error("quarantine del payload failed:", err),
        );
      orphans.push(id);
    }
    if (orphans.length > 0) {
      await this.client
        .zrem(this.sk("reminders:due"), orphans[0]!, ...orphans.slice(1))
        .catch((err) =>
          console.error("zrem orphan reminders failed:", err),
        );
    }
    return out;
  }

  async listRemindersForUser(userId: string): Promise<Reminder[]> {
    const ids = await this.client.smembers(this.sk(`user_reminders:${userId}`));
    if (ids.length === 0) return [];
    const keys = ids.map((id) => this.sk(`reminder:${id}`));
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
      this.sk("reminders:due"),
      0,
      -1,
    );
    if (ids.length === 0) return [];
    const keys = ids.map((id) => this.sk(`reminder:${id}`));
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

  async getReminder(id: string): Promise<Reminder | null> {
    const raw = await this.client.get(this.sk(`reminder:${id}`));
    if (raw === null || raw === undefined) return null;
    try {
      return parseStoredReminder(raw);
    } catch (err) {
      if (err instanceof ReminderParseError) {
        remindersParseFailuresTotal.inc({ reason: err.reason });
        console.error(
          `[reminders] skipping corrupted reminder id=${id} reason=${err.reason}:`,
          err.cause,
        );
        return null;
      }
      throw err;
    }
  }

  async countRemindersForUser(userId: string): Promise<number> {
    // SCARD is O(1). May slightly over-count if a corrupted reminder left a
    // dangling id in the set (the quarantine path can't SREM without the
    // userId); that only makes the cap marginally stricter, never looser.
    return await this.client.scard(this.sk(`user_reminders:${userId}`));
  }

  async deleteReminder(id: string, userId: string): Promise<void> {
    // Payload first so a crash leaves a ZSET orphan fetchDueReminders can GC;
    // index-first would leak a payload key (no TTL). user_reminders may
    // briefly reference a deleted id; listRemindersForUser skips MGET nulls.
    await this.client.del(this.sk(`reminder:${id}`));
    await this.client.zrem(this.sk("reminders:due"), id);
    await this.client.srem(this.sk(`user_reminders:${userId}`), id);
  }

  async recordPrivateChat(userId: string): Promise<void> {
    await this.client.set(this.sk(`user_private_chat:${userId}`), "1");
  }

  async userHasPrivateChat(userId: string): Promise<boolean> {
    const v = await this.client.get(this.sk(`user_private_chat:${userId}`));
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

  async rememberUserFact(
    userId: string,
    key: string,
    value: string,
  ): Promise<{ ok: true } | { ok: false; reason: "limit_reached" }> {
    const normKey = key.toLowerCase();
    const reply = await this.client.send("EVAL", [
      REMEMBER_FACT_LUA,
      "1",
      this.sk(`user_facts:${userId}`),
      normKey,
      value,
      String(USER_FACTS_MAX_PER_USER),
    ]);
    return parseRememberFactReply(reply);
  }

  async listUserFacts(
    userId: string,
  ): Promise<Array<{ key: string; value: string }>> {
    const all = await this.client.hgetall(this.sk(`user_facts:${userId}`));
    return Object.entries(all)
      .map(([key, value]) => ({ key, value }))
      .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  }

  async forgetUserFact(
    userId: string,
    key: string,
  ): Promise<{ existed: boolean }> {
    const normKey = key.toLowerCase();
    const removed = await this.client.hdel(
      this.sk(`user_facts:${userId}`),
      normKey,
    );
    return { existed: removed > 0 };
  }
}

// Backfill defaults for fields added after the initial schema so legacy
// records load with runtime types matching the static type.
function parseCheckJson(raw: string): RecurringCheck {
  const parsed = JSON.parse(raw) as RecurringCheck;
  return { ...parsed, counterAnchorDate: parsed.counterAnchorDate ?? null };
}
