// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

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
import { isEmptyChatSettings } from "../shared/types";
import type { Lang } from "../shared/i18n";
import type { Reminder } from "../reminders/types";
import type { RecurringCheck } from "../checks/types";
import type { ManagedBot } from "../managed-bots/types";
import type { SpendSummary } from "../spending/window";
import {
  SPEND_RETENTION_DAYS,
  summarizeSpend,
  utcDateKey,
} from "../spending/window";

// All mutable state lives in one object shared by reference across every
// `forBot` view, so a managed bot's storage and the main bot's storage see the
// same maps — they differ only by the scope prefix applied to per-character
// keys. `settings` is wrapped in a holder so the scalar can be shared too.
type Backing = {
  settings: { value: Settings | null };
  whitelist: Record<WhitelistKind, Map<string, WhitelistEntry>>;
  // Per-user usage, keyed by userId (global — not affected by `forBot` scope).
  usage: Map<string, UserUsage>;
  conversations: Map<string, ConversationNode>;
  guestThreads: Map<string, GuestThreadNode>;
  userNames: Map<string, string>;
  userTimezones: Map<string, string>;
  userGenders: Map<string, Gender>;
  userLangs: Map<string, Lang>;
  userSpend: Map<string, Map<string, number>>;
  chatSpend: Map<string, Map<string, number>>;
  globalSpend: Map<string, number>;
  modelSpend: Map<string, Map<string, number>>;
  spendModels: Set<string>;
  unpricedModels: Set<string>;
  // kind -> (UTC date -> set of entity ids that spent that day). Bounds the
  // spike scan to today's real spenders.
  spendActive: { user: Map<string, Set<string>>; chat: Map<string, Set<string>> };
  // UTC date -> (userId -> denial count) for the "who hits limits most" ranking.
  denialRank: Map<string, Map<string, number>>;
  // Wrapped so the scalar is shared by reference across `forBot` views.
  digestState: { value: { lastSentAtMs: number } | null };
  // Alert dedupe key -> expiry epoch ms (mirrors KeyDB `SET NX EX`).
  alertClaims: Map<string, number>;
  users: Map<string, User>;
  chats: Map<string, Chat>;
  chatSettings: Map<string, ChatSettings>;
  reminders: Map<string, Reminder>;
  privateChats: Set<string>;
  checks: Map<string, RecurringCheck>;
  photoCache: Map<string, Uint8Array>;
  albums: Map<string, Map<number, string>>;
  userFacts: Map<string, Map<string, string>>;
  managedBots: Map<string, ManagedBot>;
  managedBotTokens: Map<string, string>;
  // chatId -> (botId -> last-seen epoch ms). Shared across all `forBot` views.
  botPresence: Map<string, Map<string, number>>;
};

function createBacking(): Backing {
  return {
    settings: { value: null },
    whitelist: { users: new Map(), chats: new Map() },
    usage: new Map(),
    conversations: new Map(),
    guestThreads: new Map(),
    userNames: new Map(),
    userTimezones: new Map(),
    userGenders: new Map(),
    userLangs: new Map(),
    userSpend: new Map(),
    chatSpend: new Map(),
    globalSpend: new Map(),
    modelSpend: new Map(),
    spendModels: new Set(),
    unpricedModels: new Set(),
    spendActive: { user: new Map(), chat: new Map() },
    denialRank: new Map(),
    digestState: { value: null },
    alertClaims: new Map(),
    users: new Map(),
    chats: new Map(),
    chatSettings: new Map(),
    reminders: new Map(),
    privateChats: new Set(),
    checks: new Map(),
    photoCache: new Map(),
    albums: new Map(),
    userFacts: new Map(),
    managedBots: new Map(),
    managedBotTokens: new Map(),
    botPresence: new Map(),
  };
}

// Delimiter that cannot appear in any chat/user/message id, so the scope token
// and the entity key can never be confused. The main bot's empty scope yields
// keys starting with the delimiter; a managed bot's keys start with its id.
const SCOPE_SEP = "\x00";

// Accrue a positive cost into a per-UTC-date bucket map and prune buckets older
// than the retention window. Date keys are fixed-width, so a lexical `<` is a
// date comparison — shared by the user/chat/global/model spend ledgers.
function accrueDailyBucket(
  byDate: Map<string, number>,
  costUsd: number,
  nowMs: number,
): void {
  const key = utcDateKey(nowMs);
  byDate.set(key, (byDate.get(key) ?? 0) + costUsd);
  pruneDateKeyed(byDate, nowMs, SPEND_RETENTION_DAYS);
}

// Drop entries whose fixed-width `YYYY-MM-DD` key is older than `retentionDays`.
function pruneDateKeyed(
  m: Map<string, unknown>,
  nowMs: number,
  retentionDays: number,
): void {
  const cutoff = utcDateKey(nowMs - retentionDays * 86_400_000);
  for (const k of m.keys()) {
    if (k < cutoff) m.delete(k);
  }
}

export class MemoryStorage implements Storage {
  private readonly b: Backing;
  // "" for the main bot (legacy scope), the managed bot's id otherwise.
  private readonly scope: string;

  constructor(backing?: Backing, scope = "") {
    this.b = backing ?? createBacking();
    this.scope = scope;
  }

  forBot(botId: string | null): Storage {
    const scope = botId ?? "";
    if (scope === this.scope) return this;
    return new MemoryStorage(this.b, scope);
  }

  // Per-character-scoped key. The main bot (`scope === ""`) and managed bots
  // never collide because the scope token is fixed-width-delimited.
  private sk(base: string): string {
    return `${this.scope}${SCOPE_SEP}${base}`;
  }

  // True when a fully-built scoped key belongs to this view's scope. Used by
  // the iteration-based reminder lookups (which scan the shared map).
  private inScope(key: string): boolean {
    return key.startsWith(`${this.scope}${SCOPE_SEP}`);
  }

  private convKey(chatId: string, botMsgId: number): string {
    return this.sk(`${chatId}:${botMsgId}`);
  }

  async listManagedBots(): Promise<ManagedBot[]> {
    return [...this.b.managedBots.values()]
      .map((bot) => ({ ...bot }))
      .sort((a, b) => a.createdAtMs - b.createdAtMs);
  }

  async getManagedBot(botId: string): Promise<ManagedBot | null> {
    const bot = this.b.managedBots.get(botId);
    return bot ? { ...bot } : null;
  }

  async saveManagedBot(bot: ManagedBot): Promise<void> {
    this.b.managedBots.set(bot.botId, { ...bot });
  }

  async deleteManagedBot(botId: string): Promise<void> {
    this.b.managedBots.delete(botId);
  }

  async getManagedBotToken(botId: string): Promise<string | null> {
    return this.b.managedBotTokens.get(botId) ?? null;
  }

  async setManagedBotToken(botId: string, token: string | null): Promise<void> {
    if (token === null) this.b.managedBotTokens.delete(botId);
    else this.b.managedBotTokens.set(botId, token);
  }

  // Presence is a shared registry (unscoped): every `forBot` view writes to the
  // same per-chat map keyed by bot id, so a managed bot can observe the main
  // bot's (and siblings') presence regardless of which scope it is called on.
  async recordBotPresence(
    chatId: string,
    botId: string,
    atMs: number,
  ): Promise<void> {
    let m = this.b.botPresence.get(chatId);
    if (!m) {
      m = new Map();
      this.b.botPresence.set(chatId, m);
    }
    m.set(botId, atMs);
  }

  async removeBotPresence(chatId: string, botId: string): Promise<void> {
    this.b.botPresence.get(chatId)?.delete(botId);
  }

  async getBotPresence(chatId: string): Promise<Record<string, number>> {
    const m = this.b.botPresence.get(chatId);
    return m ? Object.fromEntries(m) : {};
  }

  async getSettings(): Promise<Settings | null> {
    return this.b.settings.value ? structuredClone(this.b.settings.value) : null;
  }

  async saveSettings(settings: Settings): Promise<void> {
    this.b.settings.value = structuredClone(settings);
  }

  async listWhitelist(kind: WhitelistKind): Promise<WhitelistEntry[]> {
    return [...this.b.whitelist[kind].values()];
  }

  async addWhitelist(kind: WhitelistKind, entry: WhitelistEntry): Promise<void> {
    this.b.whitelist[kind].set(entry.id, { ...entry });
  }

  async removeWhitelist(kind: WhitelistKind, id: string): Promise<void> {
    this.b.whitelist[kind].delete(id);
  }

  async isWhitelisted(kind: WhitelistKind, id: string): Promise<boolean> {
    return this.b.whitelist[kind].has(id);
  }

  async getUserUsage(userId: string): Promise<UserUsage | null> {
    const v = this.b.usage.get(userId);
    return v
      ? { fiveHour: { ...v.fiveHour }, weekly: { ...v.weekly } }
      : null;
  }

  // Atomic by JS event-loop construction: there is no `await` between the read
  // and write of `this.b.usage`, so concurrent callers cannot interleave — the
  // same guarantee the KeyDB Lua script gives. WARNING: do not introduce an
  // `await` between the `.get(userId)` and the `.set(userId, ...)` below; doing
  // so silently breaks the atomicity invariant and no test catches it. If you
  // need async work, do it before the read or after the write.
  async addUserUsage(
    userId: string,
    tokens: number,
    fiveHourWindowStart: number,
    weeklyWindowStart: number,
  ): Promise<UserUsage> {
    const current = this.b.usage.get(userId);
    const fiveUsed =
      current && current.fiveHour.windowStart === fiveHourWindowStart
        ? current.fiveHour.used + tokens
        : tokens;
    const weeklyUsed =
      current && current.weekly.windowStart === weeklyWindowStart
        ? current.weekly.used + tokens
        : tokens;
    const next: UserUsage = {
      fiveHour: { windowStart: fiveHourWindowStart, used: fiveUsed },
      weekly: { windowStart: weeklyWindowStart, used: weeklyUsed },
    };
    this.b.usage.set(userId, next);
    return { fiveHour: { ...next.fiveHour }, weekly: { ...next.weekly } };
  }

  async resetUserUsage(userId: string): Promise<void> {
    this.b.usage.delete(userId);
  }

  async getUserName(userId: string): Promise<string | null> {
    return this.b.userNames.get(userId) ?? null;
  }

  async setUserName(userId: string, name: string | null): Promise<void> {
    if (name === null) this.b.userNames.delete(userId);
    else this.b.userNames.set(userId, name);
  }

  async getUserTimezone(userId: string): Promise<string | null> {
    return this.b.userTimezones.get(userId) ?? null;
  }

  async setUserTimezone(userId: string, timezone: string | null): Promise<void> {
    if (timezone === null) this.b.userTimezones.delete(userId);
    else this.b.userTimezones.set(userId, timezone);
  }

  async getUserGender(userId: string): Promise<Gender | null> {
    return this.b.userGenders.get(userId) ?? null;
  }

  async setUserGender(userId: string, gender: Gender | null): Promise<void> {
    if (gender === null) this.b.userGenders.delete(userId);
    else this.b.userGenders.set(userId, gender);
  }

  async getUserLang(userId: string): Promise<Lang | null> {
    return this.b.userLangs.get(userId) ?? null;
  }

  async setUserLang(userId: string, lang: Lang | null): Promise<void> {
    if (lang === null) this.b.userLangs.delete(userId);
    else this.b.userLangs.set(userId, lang);
  }

  private nestedBucket(
    outer: Map<string, Map<string, number>>,
    id: string,
  ): Map<string, number> {
    let byDate = outer.get(id);
    if (!byDate) {
      byDate = new Map();
      outer.set(id, byDate);
    }
    return byDate;
  }

  private markActive(kind: "user" | "chat", id: string, nowMs: number): void {
    const byDate = this.b.spendActive[kind];
    const key = utcDateKey(nowMs);
    let set = byDate.get(key);
    if (!set) {
      set = new Set();
      byDate.set(key, set);
    }
    set.add(id);
    // Active-spender sets are only needed for the near-real-time spike scan.
    pruneDateKeyed(byDate, nowMs, 2);
  }

  async addUserSpend(
    userId: string,
    costUsd: number,
    nowMs: number,
  ): Promise<void> {
    if (!(costUsd > 0)) return;
    accrueDailyBucket(this.nestedBucket(this.b.userSpend, userId), costUsd, nowMs);
    this.markActive("user", userId, nowMs);
  }

  async getUserSpend(userId: string, nowMs: number): Promise<SpendSummary> {
    return summarizeSpend(this.b.userSpend.get(userId) ?? new Map(), nowMs);
  }

  async addChatSpend(
    chatId: string,
    costUsd: number,
    nowMs: number,
  ): Promise<void> {
    if (!(costUsd > 0)) return;
    accrueDailyBucket(this.nestedBucket(this.b.chatSpend, chatId), costUsd, nowMs);
    this.markActive("chat", chatId, nowMs);
  }

  async getChatSpend(chatId: string, nowMs: number): Promise<SpendSummary> {
    return summarizeSpend(this.b.chatSpend.get(chatId) ?? new Map(), nowMs);
  }

  async addGlobalSpend(costUsd: number, nowMs: number): Promise<void> {
    if (!(costUsd > 0)) return;
    accrueDailyBucket(this.b.globalSpend, costUsd, nowMs);
  }

  async getGlobalSpend(nowMs: number): Promise<SpendSummary> {
    return summarizeSpend(this.b.globalSpend, nowMs);
  }

  async addModelSpend(
    modelId: string,
    costUsd: number,
    nowMs: number,
  ): Promise<void> {
    if (!(costUsd > 0)) return;
    accrueDailyBucket(this.nestedBucket(this.b.modelSpend, modelId), costUsd, nowMs);
    this.b.spendModels.add(modelId);
  }

  async getModelSpend(modelId: string, nowMs: number): Promise<SpendSummary> {
    return summarizeSpend(this.b.modelSpend.get(modelId) ?? new Map(), nowMs);
  }

  async listSpendModels(): Promise<string[]> {
    return [...this.b.spendModels];
  }

  async flagUnpricedModel(modelId: string): Promise<void> {
    this.b.unpricedModels.add(modelId);
  }

  async listUnpricedModels(): Promise<string[]> {
    return [...this.b.unpricedModels];
  }

  async listSpendActiveEntities(
    kind: "user" | "chat",
    nowMs: number,
  ): Promise<string[]> {
    const set = this.b.spendActive[kind].get(utcDateKey(nowMs));
    return set ? [...set] : [];
  }

  async incrementDenialCount(userId: string, nowMs: number): Promise<void> {
    const key = utcDateKey(nowMs);
    let byUser = this.b.denialRank.get(key);
    if (!byUser) {
      byUser = new Map();
      this.b.denialRank.set(key, byUser);
    }
    byUser.set(userId, (byUser.get(userId) ?? 0) + 1);
    pruneDateKeyed(this.b.denialRank, nowMs, 9);
  }

  async topDenied(
    nowMs: number,
    limit: number,
  ): Promise<Array<{ userId: string; count: number }>> {
    const byUser = this.b.denialRank.get(utcDateKey(nowMs));
    if (!byUser) return [];
    return [...byUser.entries()]
      .map(([userId, count]) => ({ userId, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, Math.max(0, limit));
  }

  async getDigestState(): Promise<{ lastSentAtMs: number } | null> {
    return this.b.digestState.value ? { ...this.b.digestState.value } : null;
  }

  async setDigestState(state: { lastSentAtMs: number }): Promise<void> {
    this.b.digestState.value = { ...state };
  }

  async claimAlert(key: string, ttlSeconds: number): Promise<boolean> {
    const now = Date.now();
    const existing = this.b.alertClaims.get(key);
    if (existing !== undefined && existing > now) return false;
    this.b.alertClaims.set(key, now + ttlSeconds * 1000);
    return true;
  }

  async listUsers(): Promise<User[]> {
    return [...this.b.users.values()]
      .map((u) => ({ ...u }))
      .sort((a, b) => b.lastSeenAt - a.lastSeenAt);
  }

  async upsertUser(user: User): Promise<{ isNew: boolean }> {
    const existing = this.b.users.get(user.id);
    const isNew = existing === undefined;
    // Preserve the original first-seen instant; a legacy record without one is
    // treated as long-known (epoch 0), never "new".
    const firstSeenAt = existing ? existing.firstSeenAt ?? 0 : user.firstSeenAt;
    this.b.users.set(user.id, { ...user, firstSeenAt });
    return { isNew };
  }

  async getUser(id: string): Promise<User | null> {
    const u = this.b.users.get(id);
    return u ? { ...u } : null;
  }

  async listChats(): Promise<Chat[]> {
    return [...this.b.chats.values()]
      .map((c) => ({ ...c }))
      .sort((a, b) => b.lastSeenAt - a.lastSeenAt);
  }

  async upsertChat(chat: Chat): Promise<{ isNew: boolean }> {
    const existing = this.b.chats.get(chat.id);
    const isNew = existing === undefined;
    const firstSeenAt = existing ? existing.firstSeenAt ?? 0 : chat.firstSeenAt;
    this.b.chats.set(chat.id, { ...chat, firstSeenAt });
    return { isNew };
  }

  async getChat(id: string): Promise<Chat | null> {
    const c = this.b.chats.get(id);
    return c ? { ...c } : null;
  }

  async getChatSettings(chatId: string): Promise<ChatSettings | null> {
    const s = this.b.chatSettings.get(chatId);
    return s ? structuredClone(s) : null;
  }

  async saveChatSettings(chatId: string, settings: ChatSettings): Promise<void> {
    if (isEmptyChatSettings(settings)) {
      this.b.chatSettings.delete(chatId);
      return;
    }
    this.b.chatSettings.set(chatId, structuredClone(settings));
  }

  async getConversation(chatId: string, botMsgId: number): Promise<ConversationNode | null> {
    const v = this.b.conversations.get(this.convKey(chatId, botMsgId));
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
    this.b.conversations.set(this.convKey(chatId, botMsgId), {
      ...node,
      userImageFileIds: node.userImageFileIds
        ? [...node.userImageFileIds]
        : undefined,
    });
  }

  async getPhotoBytes(fileId: string): Promise<Uint8Array | null> {
    const b = this.b.photoCache.get(fileId);
    return b ? new Uint8Array(b) : null;
  }

  async savePhotoBytes(fileId: string, bytes: Uint8Array): Promise<void> {
    this.b.photoCache.set(fileId, new Uint8Array(bytes));
  }

  private albumKey(chatId: string, mediaGroupId: string): string {
    return this.sk(`${chatId}:${mediaGroupId}`);
  }

  async appendAlbumPhoto(
    chatId: string,
    mediaGroupId: string,
    photo: { messageId: number; fileId: string },
  ): Promise<void> {
    const key = this.albumKey(chatId, mediaGroupId);
    let m = this.b.albums.get(key);
    if (!m) {
      m = new Map();
      this.b.albums.set(key, m);
    }
    m.set(photo.messageId, photo.fileId);
  }

  async getAlbumPhotos(
    chatId: string,
    mediaGroupId: string,
  ): Promise<Array<{ messageId: number; fileId: string }>> {
    const m = this.b.albums.get(this.albumKey(chatId, mediaGroupId));
    if (!m) return [];
    return [...m.entries()].map(([messageId, fileId]) => ({
      messageId,
      fileId,
    }));
  }

  async getGuestThread(chatId: string): Promise<GuestThreadNode | null> {
    const v = this.b.guestThreads.get(this.sk(chatId));
    return v ? structuredClone(v) : null;
  }

  async saveGuestThread(chatId: string, thread: GuestThreadNode): Promise<void> {
    this.b.guestThreads.set(this.sk(chatId), structuredClone(thread));
  }

  async saveReminder(reminder: Reminder): Promise<void> {
    this.b.reminders.set(this.sk(reminder.id), structuredClone(reminder));
  }

  async fetchDueReminders(nowMs: number): Promise<Reminder[]> {
    const out: Reminder[] = [];
    for (const [key, r] of this.b.reminders.entries()) {
      if (this.inScope(key) && r.fireAtMs <= nowMs) out.push(structuredClone(r));
    }
    return out.sort((a, b) => a.fireAtMs - b.fireAtMs);
  }

  async listRemindersForUser(userId: string): Promise<Reminder[]> {
    const out: Reminder[] = [];
    for (const [key, r] of this.b.reminders.entries()) {
      if (this.inScope(key) && r.userId === userId) out.push(structuredClone(r));
    }
    return out.sort((a, b) => a.fireAtMs - b.fireAtMs);
  }

  async listAllReminders(): Promise<Reminder[]> {
    const out: Reminder[] = [];
    for (const [key, r] of this.b.reminders.entries()) {
      if (this.inScope(key)) out.push(structuredClone(r));
    }
    return out.sort((a, b) => a.fireAtMs - b.fireAtMs);
  }

  async getReminder(id: string): Promise<Reminder | null> {
    const r = this.b.reminders.get(this.sk(id));
    return r ? structuredClone(r) : null;
  }

  async countRemindersForUser(userId: string): Promise<number> {
    let n = 0;
    for (const [key, r] of this.b.reminders.entries()) {
      if (this.inScope(key) && r.userId === userId) n++;
    }
    return n;
  }

  async deleteReminder(id: string, _userId: string): Promise<void> {
    this.b.reminders.delete(this.sk(id));
  }

  async recordPrivateChat(userId: string): Promise<void> {
    this.b.privateChats.add(this.sk(userId));
  }

  async userHasPrivateChat(userId: string): Promise<boolean> {
    return this.b.privateChats.has(this.sk(userId));
  }

  async saveCheck(check: RecurringCheck): Promise<void> {
    this.b.checks.set(check.id, structuredClone(check));
  }

  async getCheck(id: string): Promise<RecurringCheck | null> {
    const c = this.b.checks.get(id);
    return c ? structuredClone(c) : null;
  }

  async listChecks(): Promise<RecurringCheck[]> {
    return [...this.b.checks.values()]
      .map((c) => structuredClone(c))
      .sort((a, b) => a.createdAtMs - b.createdAtMs);
  }

  async deleteCheck(id: string): Promise<void> {
    this.b.checks.delete(id);
  }

  async rememberUserFact(
    userId: string,
    key: string,
    value: string,
  ): Promise<{ ok: true } | { ok: false; reason: "limit_reached" }> {
    const normKey = key.toLowerCase();
    const factsKey = this.sk(userId);
    let facts = this.b.userFacts.get(factsKey);
    if (!facts) {
      facts = new Map();
      this.b.userFacts.set(factsKey, facts);
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
    const facts = this.b.userFacts.get(this.sk(userId));
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
    const facts = this.b.userFacts.get(this.sk(userId));
    if (!facts) return { existed: false };
    const existed = facts.delete(normKey);
    return { existed };
  }
}
