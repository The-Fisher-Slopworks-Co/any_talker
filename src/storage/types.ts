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
  // separately and never returned to the admin UI (mirrors the BYOK key model).
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

  getUserOpenrouterKey(userId: string): Promise<string | null>;
  setUserOpenrouterKey(userId: string, key: string | null): Promise<void>;

  getUserOpenrouterModels(userId: string): Promise<string[] | null>;
  setUserOpenrouterModels(userId: string, models: string[] | null): Promise<void>;

  // Accrues `costUsd` to the user's spend for the UTC date of `nowMs`. A
  // non-positive cost is a no-op so free/uncosted replies don't create buckets.
  addUserSpend(userId: string, costUsd: number, nowMs: number): Promise<void>;
  getUserSpend(userId: string, nowMs: number): Promise<SpendSummary>;

  listUsers(): Promise<User[]>;
  upsertUser(user: User): Promise<void>;
  getUser(id: string): Promise<User | null>;

  listChats(): Promise<Chat[]>;
  upsertChat(chat: Chat): Promise<void>;
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
