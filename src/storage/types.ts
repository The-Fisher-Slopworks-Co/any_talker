// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

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
import type { Lang } from "../shared/i18n";
import type { Reminder } from "../reminders/types";
import type { RecurringCheck } from "../checks/types";

export interface Storage {
  getSettings(): Promise<Settings | null>;
  saveSettings(settings: Settings): Promise<void>;

  listWhitelist(kind: WhitelistKind): Promise<WhitelistEntry[]>;
  addWhitelist(kind: WhitelistKind, entry: WhitelistEntry): Promise<void>;
  removeWhitelist(kind: WhitelistKind, id: string): Promise<void>;
  isWhitelisted(kind: WhitelistKind, id: string): Promise<boolean>;

  getBucket(chatId: string, userId: string): Promise<BucketState | null>;
  saveBucket(chatId: string, userId: string, state: BucketState): Promise<void>;

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
}
