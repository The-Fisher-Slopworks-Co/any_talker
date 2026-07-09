// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

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
import type { Lang } from "../shared/i18n";
import type { Reminder } from "../reminders/types";
import type { RecurringCheck } from "../checks/types";
import type { ManagedBot } from "../managed-bots/types";
import type { SpendSummary } from "../spending/window";

export interface Storage {
  // Returns a view of this storage scoped to a single bot's per-character data:
  // the conversation graph, reminders, user facts, guest threads, album buffers
  // and private-chat flags. `null` is the main bot and yields the original
  // unprefixed keys — byte-identical to storage that never knew about scoping,
  // so existing data and all current call sites are unaffected. A managed bot's
  // id namespaces those entities under an `mbot:{botId}:` segment; every *other*
  // method (settings, whitelist, per-user rate-limit usage, users/chats
  // directory, spend, user attributes, photo cache, checks, the managed-bot
  // registry) is shared across all scopes regardless of which view it is called on.
  forBot(botId: string | null): Storage;

  // Managed-bot registry + token store. These are global (not affected by
  // `forBot` scoping): the registry is owned by the main bot. Tokens are stored
  // separately and never returned to the admin UI (write-only, like a secret).
  listManagedBots(): Promise<ManagedBot[]>;
  getManagedBot(botId: string): Promise<ManagedBot | null>;
  saveManagedBot(bot: ManagedBot): Promise<void>;
  deleteManagedBot(botId: string): Promise<void>;
  getManagedBotToken(botId: string): Promise<string | null>;
  setManagedBotToken(botId: string, token: string | null): Promise<void>;

  // Cross-bot presence registry (global, not affected by `forBot`): tracks which
  // "family" bots (main + managed) are members of each group chat, so a managed
  // bot can tell whether it is alone there and may answer a bare `/ask`. Each
  // entry maps a bot id to its last-seen epoch ms; the value is refreshed on
  // membership changes and on activity, and the reader prunes stale entries by
  // TTL. Private chats are never tracked (a DM is inherently one-bot).
  recordBotPresence(chatId: string, botId: string, atMs: number): Promise<void>;
  removeBotPresence(chatId: string, botId: string): Promise<void>;
  getBotPresence(chatId: string): Promise<Record<string, number>>;

  getSettings(): Promise<Settings | null>;
  saveSettings(settings: Settings): Promise<void>;

  listWhitelist(kind: WhitelistKind): Promise<WhitelistEntry[]>;
  addWhitelist(kind: WhitelistKind, entry: WhitelistEntry): Promise<void>;
  removeWhitelist(kind: WhitelistKind, id: string): Promise<void>;
  isWhitelisted(kind: WhitelistKind, id: string): Promise<boolean>;

  // Per-user dual-window token usage (5-hour + weekly). Global (not affected by
  // `forBot`): one budget per user, shared across all chats and family bots.
  getUserUsage(userId: string): Promise<UserUsage | null>;
  // Atomically accrues `tokens` to both windows. The caller passes the current
  // start of each window (computed from the user's deterministic phase offset);
  // a stored window whose start differs has rolled over, so its `used` is reset
  // to 0 before the tokens are added. Returns the updated record.
  addUserUsage(
    userId: string,
    tokens: number,
    fiveHourWindowStart: number,
    weeklyWindowStart: number,
  ): Promise<UserUsage>;
  // Clears the user's usage (admin reset): both windows drop to 0.
  resetUserUsage(userId: string): Promise<void>;

  getUserName(userId: string): Promise<string | null>;
  setUserName(userId: string, name: string | null): Promise<void>;

  getUserTimezone(userId: string): Promise<string | null>;
  setUserTimezone(userId: string, timezone: string | null): Promise<void>;

  getUserGender(userId: string): Promise<Gender | null>;
  setUserGender(userId: string, gender: Gender | null): Promise<void>;

  getUserLang(userId: string): Promise<Lang | null>;
  setUserLang(userId: string, lang: Lang | null): Promise<void>;

  // Accrues `costUsd` to the user's spend for the UTC date of `nowMs`. A
  // non-positive cost is a no-op so free/uncosted replies don't create buckets.
  // Also records the user in the day's "active spenders" set (see
  // `listSpendActiveEntities`).
  addUserSpend(userId: string, costUsd: number, nowMs: number): Promise<void>;
  getUserSpend(userId: string, nowMs: number): Promise<SpendSummary>;

  // Parallel per-chat / global / per-model spend accounting, same UTC-day
  // bucketing and retention as `addUserSpend`. Written alongside it by
  // `spending/record.ts` so the budget guard and dashboard can see spend from
  // every angle (who / where / which model). All non-positive costs are no-ops.
  addChatSpend(chatId: string, costUsd: number, nowMs: number): Promise<void>;
  getChatSpend(chatId: string, nowMs: number): Promise<SpendSummary>;
  addGlobalSpend(costUsd: number, nowMs: number): Promise<void>;
  getGlobalSpend(nowMs: number): Promise<SpendSummary>;
  addModelSpend(modelId: string, costUsd: number, nowMs: number): Promise<void>;
  getModelSpend(modelId: string, nowMs: number): Promise<SpendSummary>;
  // Directory of every model id that has ever recorded spend (for the per-model
  // dashboard breakdown — model metadata itself lives in the ModelCatalog).
  listSpendModels(): Promise<string[]>;

  // Records that a model answered without pricing data (cost computed as $0), so
  // the owner can be told their spend numbers are under-counting. Idempotent.
  flagUnpricedModel(modelId: string): Promise<void>;
  listUnpricedModels(): Promise<string[]>;

  // The user/chat ids that actually spent on the UTC date of `nowMs`. Bounds the
  // periodic spike scan to today's real spenders instead of every entity ever.
  listSpendActiveEntities(
    kind: "user" | "chat",
    nowMs: number,
  ): Promise<string[]>;

  // Per-user denial ranking for "who hits limits most" — incremented on every
  // budget/rate-limit denial. Prometheus deliberately carries no per-user label
  // (cardinality), so this is the only per-user denial signal. `topDenied`
  // returns the highest-denied users for the UTC date of `nowMs`.
  incrementDenialCount(userId: string, nowMs: number): Promise<void>;
  topDenied(
    nowMs: number,
    limit: number,
  ): Promise<Array<{ userId: string; count: number }>>;

  // Cadence bookkeeping for the periodic owner digest (last-sent timestamp).
  getDigestState(): Promise<{ lastSentAtMs: number } | null>;
  setDigestState(state: { lastSentAtMs: number }): Promise<void>;

  // One-shot idempotent alert claim: returns true only for the FIRST caller
  // within `ttlSeconds` for a given `key`, so an alert (global-cap breach, a
  // per-entity spike) is DM'd to the owner once per period rather than on every
  // request/scan that observes the same condition.
  claimAlert(key: string, ttlSeconds: number): Promise<boolean>;

  listUsers(): Promise<User[]>;
  // Upserts the user directory row, preserving `firstSeenAt` across updates.
  // Returns `{ isNew: true }` only when no row existed before — the signal that
  // drives new-user detection and the new-user soft-start budget.
  upsertUser(user: User): Promise<{ isNew: boolean }>;
  getUser(id: string): Promise<User | null>;

  listChats(): Promise<Chat[]>;
  // Upserts the chat directory row, preserving `firstSeenAt`. `{ isNew: true }`
  // for a never-before-seen chat (a new non-private chat is a fresh group join).
  upsertChat(chat: Chat): Promise<{ isNew: boolean }>;
  getChat(id: string): Promise<Chat | null>;

  getChatSettings(chatId: string): Promise<ChatSettings | null>;
  saveChatSettings(chatId: string, settings: ChatSettings): Promise<void>;

  getConversation(chatId: string, botMsgId: number): Promise<ConversationNode | null>;
  saveConversation(
    chatId: string,
    botMsgId: number,
    node: ConversationNode,
  ): Promise<void>;

  getPhotoBytes(fileId: string): Promise<Uint8Array | null>;
  savePhotoBytes(fileId: string, bytes: Uint8Array): Promise<void>;

  appendAlbumPhoto(
    chatId: string,
    mediaGroupId: string,
    photo: { messageId: number; fileId: string },
  ): Promise<void>;
  getAlbumPhotos(
    chatId: string,
    mediaGroupId: string,
  ): Promise<Array<{ messageId: number; fileId: string }>>;

  getGuestThread(chatId: string): Promise<GuestThreadNode | null>;
  saveGuestThread(chatId: string, thread: GuestThreadNode): Promise<void>;

  saveReminder(reminder: Reminder): Promise<void>;
  fetchDueReminders(nowMs: number): Promise<Reminder[]>;
  listRemindersForUser(userId: string): Promise<Reminder[]>;
  listAllReminders(): Promise<Reminder[]>;
  // Fetch a single reminder by id (O(1)); null if absent or corrupt. Lets the
  // cancel tool verify ownership and read fireAtMs without an O(n) list scan.
  getReminder(id: string): Promise<Reminder | null>;
  // Count a user's reminders (O(1) via SCARD) for the per-user creation cap.
  // May over-count slightly if a corrupted reminder left a dangling id in the
  // index (the quarantine path can't reverse-map it to a user) — that only makes
  // the cap marginally stricter, never looser, which is fine for a soft cap.
  countRemindersForUser(userId: string): Promise<number>;
  deleteReminder(id: string, userId: string): Promise<void>;

  recordPrivateChat(userId: string): Promise<void>;
  userHasPrivateChat(userId: string): Promise<boolean>;

  saveCheck(check: RecurringCheck): Promise<void>;
  getCheck(id: string): Promise<RecurringCheck | null>;
  listChecks(): Promise<RecurringCheck[]>;
  deleteCheck(id: string): Promise<void>;

  rememberUserFact(
    userId: string,
    key: string,
    value: string,
  ): Promise<{ ok: true } | { ok: false; reason: "limit_reached" }>;
  listUserFacts(userId: string): Promise<Array<{ key: string; value: string }>>;
  forgetUserFact(userId: string, key: string): Promise<{ existed: boolean }>;
}

export const USER_FACTS_MAX_PER_USER = 50;
