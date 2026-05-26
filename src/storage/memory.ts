// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { Storage } from "./types";
import { USER_FACTS_MAX_PER_USER } from "./types";
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
import { isEmptyChatSettings } from "../shared/types";
import type { Lang } from "../shared/i18n";
import type { Reminder } from "../reminders/types";
import type { RecurringCheck } from "../checks/types";
import type { SpendSummary } from "../spending/window";
import {
  SPEND_RETENTION_DAYS,
  summarizeSpend,
  utcDateKey,
} from "../spending/window";

export class MemoryStorage implements Storage {
  private settings: Settings | null = null;
  private whitelist: Record<WhitelistKind, Map<string, WhitelistEntry>> = {
    users: new Map(),
    chats: new Map(),
  };
  private buckets = new Map<string, BucketState>();
  private conversations = new Map<string, ConversationNode>();
  private guestThreads = new Map<string, GuestThreadNode>();
  private userNames = new Map<string, string>();
  private userTimezones = new Map<string, string>();
  private userGenders = new Map<string, Gender>();
  private userLangs = new Map<string, Lang>();
  private userOpenrouterKeys = new Map<string, string>();
  private userOpenrouterModels = new Map<string, string[]>();
  private userSpend = new Map<string, Map<string, number>>();
  private users = new Map<string, User>();
  private chats = new Map<string, Chat>();
  private chatSettings = new Map<string, ChatSettings>();
  private reminders = new Map<string, Reminder>();
  private privateChats = new Set<string>();
  private checks = new Map<string, RecurringCheck>();
  private photoCache = new Map<string, Uint8Array>();
  private albums = new Map<string, Map<number, string>>();
  private userFacts = new Map<string, Map<string, string>>();

  private bucketKey(chatId: string, userId: string): string {
    return `${chatId}:${userId}`;
  }

  private convKey(chatId: string, botMsgId: number): string {
    return `${chatId}:${botMsgId}`;
  }

  async getSettings(): Promise<Settings | null> {
    return this.settings ? structuredClone(this.settings) : null;
  }

  async saveSettings(settings: Settings): Promise<void> {
    this.settings = structuredClone(settings);
  }

  async listWhitelist(kind: WhitelistKind): Promise<WhitelistEntry[]> {
    return [...this.whitelist[kind].values()];
  }

  async addWhitelist(kind: WhitelistKind, entry: WhitelistEntry): Promise<void> {
    this.whitelist[kind].set(entry.id, { ...entry });
  }

  async removeWhitelist(kind: WhitelistKind, id: string): Promise<void> {
    this.whitelist[kind].delete(id);
  }

  async isWhitelisted(kind: WhitelistKind, id: string): Promise<boolean> {
    return this.whitelist[kind].has(id);
  }

  async getBucket(chatId: string, userId: string): Promise<BucketState | null> {
    const v = this.buckets.get(this.bucketKey(chatId, userId));
    return v ? { ...v } : null;
  }

  async saveBucket(
    chatId: string,
    userId: string,
    state: BucketState,
  ): Promise<void> {
    this.buckets.set(this.bucketKey(chatId, userId), { ...state });
  }

  // Atomic by JS event-loop construction: there is no `await` between the
  // read and write of `this.buckets`, so concurrent callers cannot interleave.
  // WARNING: do not introduce an `await` between the `.get(key)` and the
  // `.set(key, ...)` below — doing so silently breaks the atomicity invariant
  // and there is no test that catches it. If you need async work, do it
  // before the read or after the write.
  async refillBucket(
    chatId: string,
    userId: string,
    config: RateLimitConfig,
    now: number,
  ): Promise<BucketState> {
    const key = this.bucketKey(chatId, userId);
    const current = this.buckets.get(key);
    let next: BucketState;
    if (!current) {
      next = { tokens: config.capacity, lastRefillTs: now };
    } else {
      const elapsed = now - current.lastRefillTs;
      if (elapsed < config.refillIntervalMs) {
        next = { ...current };
      } else {
        const periods = Math.floor(elapsed / config.refillIntervalMs);
        next = {
          tokens: Math.min(
            config.capacity,
            current.tokens + periods * config.refillAmount,
          ),
          lastRefillTs:
            current.lastRefillTs + periods * config.refillIntervalMs,
        };
      }
    }
    this.buckets.set(key, { ...next });
    return next;
  }

  async deductBucket(
    chatId: string,
    userId: string,
    tokens: number,
    nowMs: number,
  ): Promise<BucketState> {
    const key = this.bucketKey(chatId, userId);
    const current = this.buckets.get(key);
    const next: BucketState = current
      ? { tokens: current.tokens - tokens, lastRefillTs: current.lastRefillTs }
      : { tokens: -tokens, lastRefillTs: nowMs };
    this.buckets.set(key, { ...next });
    return next;
  }

  async getUserName(userId: string): Promise<string | null> {
    return this.userNames.get(userId) ?? null;
  }

  async setUserName(userId: string, name: string | null): Promise<void> {
    if (name === null) this.userNames.delete(userId);
    else this.userNames.set(userId, name);
  }

  async getUserTimezone(userId: string): Promise<string | null> {
    return this.userTimezones.get(userId) ?? null;
  }

  async setUserTimezone(userId: string, timezone: string | null): Promise<void> {
    if (timezone === null) this.userTimezones.delete(userId);
    else this.userTimezones.set(userId, timezone);
  }

  async getUserGender(userId: string): Promise<Gender | null> {
    return this.userGenders.get(userId) ?? null;
  }

  async setUserGender(userId: string, gender: Gender | null): Promise<void> {
    if (gender === null) this.userGenders.delete(userId);
    else this.userGenders.set(userId, gender);
  }

  async getUserLang(userId: string): Promise<Lang | null> {
    return this.userLangs.get(userId) ?? null;
  }

  async setUserLang(userId: string, lang: Lang | null): Promise<void> {
    if (lang === null) this.userLangs.delete(userId);
    else this.userLangs.set(userId, lang);
  }

  async getUserOpenrouterKey(userId: string): Promise<string | null> {
    return this.userOpenrouterKeys.get(userId) ?? null;
  }

  async setUserOpenrouterKey(userId: string, key: string | null): Promise<void> {
    if (key === null) this.userOpenrouterKeys.delete(userId);
    else this.userOpenrouterKeys.set(userId, key);
  }

  async getUserOpenrouterModels(userId: string): Promise<string[] | null> {
    const v = this.userOpenrouterModels.get(userId);
    return v ? [...v] : null;
  }

  async setUserOpenrouterModels(
    userId: string,
    models: string[] | null,
  ): Promise<void> {
    if (models === null) this.userOpenrouterModels.delete(userId);
    else this.userOpenrouterModels.set(userId, [...models]);
  }

  async addUserSpend(
    userId: string,
    costUsd: number,
    nowMs: number,
  ): Promise<void> {
    if (!(costUsd > 0)) return;
    let byDate = this.userSpend.get(userId);
    if (!byDate) {
      byDate = new Map();
      this.userSpend.set(userId, byDate);
    }
    const key = utcDateKey(nowMs);
    byDate.set(key, (byDate.get(key) ?? 0) + costUsd);
    // Prune buckets older than the retention window. Date keys are fixed-width
    // so a lexical comparison is a date comparison.
    const cutoff = utcDateKey(nowMs - SPEND_RETENTION_DAYS * 86_400_000);
    for (const k of byDate.keys()) {
      if (k < cutoff) byDate.delete(k);
    }
  }

  async getUserSpend(userId: string, nowMs: number): Promise<SpendSummary> {
    return summarizeSpend(this.userSpend.get(userId) ?? new Map(), nowMs);
  }

  async listUsers(): Promise<User[]> {
    return [...this.users.values()]
      .map((u) => ({ ...u }))
      .sort((a, b) => b.lastSeenAt - a.lastSeenAt);
  }

  async upsertUser(user: User): Promise<void> {
    this.users.set(user.id, { ...user });
  }

  async getUser(id: string): Promise<User | null> {
    const u = this.users.get(id);
    return u ? { ...u } : null;
  }

  async listChats(): Promise<Chat[]> {
    return [...this.chats.values()]
      .map((c) => ({ ...c }))
      .sort((a, b) => b.lastSeenAt - a.lastSeenAt);
  }

  async upsertChat(chat: Chat): Promise<void> {
    this.chats.set(chat.id, { ...chat });
  }

  async getChat(id: string): Promise<Chat | null> {
    const c = this.chats.get(id);
    return c ? { ...c } : null;
  }

  async getChatSettings(chatId: string): Promise<ChatSettings | null> {
    const s = this.chatSettings.get(chatId);
    return s ? structuredClone(s) : null;
  }

  async saveChatSettings(chatId: string, settings: ChatSettings): Promise<void> {
    if (isEmptyChatSettings(settings)) {
      this.chatSettings.delete(chatId);
      return;
    }
    this.chatSettings.set(chatId, structuredClone(settings));
  }

  async getConversation(chatId: string, botMsgId: number): Promise<ConversationNode | null> {
    const v = this.conversations.get(this.convKey(chatId, botMsgId));
    if (!v) return null;
    return {
      ...v,
      userImageFileIds: v.userImageFileIds ? [...v.userImageFileIds] : undefined,
    };
  }

  async saveConversation(
    chatId: string,
    botMsgId: number,
    node: ConversationNode,
  ): Promise<void> {
    this.conversations.set(this.convKey(chatId, botMsgId), {
      ...node,
      userImageFileIds: node.userImageFileIds
        ? [...node.userImageFileIds]
        : undefined,
    });
  }

  async getPhotoBytes(fileId: string): Promise<Uint8Array | null> {
    const b = this.photoCache.get(fileId);
    return b ? new Uint8Array(b) : null;
  }

  async savePhotoBytes(fileId: string, bytes: Uint8Array): Promise<void> {
    this.photoCache.set(fileId, new Uint8Array(bytes));
  }

  private albumKey(chatId: string, mediaGroupId: string): string {
    return `${chatId}:${mediaGroupId}`;
  }

  async appendAlbumPhoto(
    chatId: string,
    mediaGroupId: string,
    photo: { messageId: number; fileId: string },
  ): Promise<void> {
    const key = this.albumKey(chatId, mediaGroupId);
    let m = this.albums.get(key);
    if (!m) {
      m = new Map();
      this.albums.set(key, m);
    }
    m.set(photo.messageId, photo.fileId);
  }

  async getAlbumPhotos(
    chatId: string,
    mediaGroupId: string,
  ): Promise<Array<{ messageId: number; fileId: string }>> {
    const m = this.albums.get(this.albumKey(chatId, mediaGroupId));
    if (!m) return [];
    return [...m.entries()].map(([messageId, fileId]) => ({
      messageId,
      fileId,
    }));
  }

  async getGuestThread(chatId: string): Promise<GuestThreadNode | null> {
    const v = this.guestThreads.get(chatId);
    return v ? structuredClone(v) : null;
  }

  async saveGuestThread(chatId: string, thread: GuestThreadNode): Promise<void> {
    this.guestThreads.set(chatId, structuredClone(thread));
  }

  async saveReminder(reminder: Reminder): Promise<void> {
    this.reminders.set(reminder.id, structuredClone(reminder));
  }

  async fetchDueReminders(nowMs: number): Promise<Reminder[]> {
    const out: Reminder[] = [];
    for (const r of this.reminders.values()) {
      if (r.fireAtMs <= nowMs) out.push(structuredClone(r));
    }
    return out.sort((a, b) => a.fireAtMs - b.fireAtMs);
  }

  async listRemindersForUser(userId: string): Promise<Reminder[]> {
    const out: Reminder[] = [];
    for (const r of this.reminders.values()) {
      if (r.userId === userId) out.push(structuredClone(r));
    }
    return out.sort((a, b) => a.fireAtMs - b.fireAtMs);
  }

  async listAllReminders(): Promise<Reminder[]> {
    return [...this.reminders.values()]
      .map((r) => structuredClone(r))
      .sort((a, b) => a.fireAtMs - b.fireAtMs);
  }

  async deleteReminder(id: string, _userId: string): Promise<void> {
    this.reminders.delete(id);
  }

  async recordPrivateChat(userId: string): Promise<void> {
    this.privateChats.add(userId);
  }

  async userHasPrivateChat(userId: string): Promise<boolean> {
    return this.privateChats.has(userId);
  }

  async saveCheck(check: RecurringCheck): Promise<void> {
    this.checks.set(check.id, structuredClone(check));
  }

  async getCheck(id: string): Promise<RecurringCheck | null> {
    const c = this.checks.get(id);
    return c ? structuredClone(c) : null;
  }

  async listChecks(): Promise<RecurringCheck[]> {
    return [...this.checks.values()]
      .map((c) => structuredClone(c))
      .sort((a, b) => a.createdAtMs - b.createdAtMs);
  }

  async deleteCheck(id: string): Promise<void> {
    this.checks.delete(id);
  }

  async rememberUserFact(
    userId: string,
    key: string,
    value: string,
  ): Promise<{ ok: true } | { ok: false; reason: "limit_reached" }> {
    const normKey = key.toLowerCase();
    let facts = this.userFacts.get(userId);
    if (!facts) {
      facts = new Map();
      this.userFacts.set(userId, facts);
    }
    // Updates to existing keys never evict. A NEW key at the cap evicts the
    // oldest-inserted fact to make room — Map iterates in insertion order, so
    // the first key is the oldest. (A bare update via Map.set keeps the key's
    // original position, so it doesn't reset a fact's age.)
    if (!facts.has(normKey) && facts.size >= USER_FACTS_MAX_PER_USER) {
      const oldest = facts.keys().next().value;
      if (oldest !== undefined) facts.delete(oldest);
    }
    facts.set(normKey, value);
    return { ok: true };
  }

  async listUserFacts(
    userId: string,
  ): Promise<Array<{ key: string; value: string }>> {
    const facts = this.userFacts.get(userId);
    if (!facts) return [];
    return [...facts.entries()]
      .map(([key, value]) => ({ key, value }))
      .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  }

  async forgetUserFact(
    userId: string,
    key: string,
  ): Promise<{ existed: boolean }> {
    const normKey = key.toLowerCase();
    const facts = this.userFacts.get(userId);
    if (!facts) return { existed: false };
    const existed = facts.delete(normKey);
    return { existed };
  }
}
