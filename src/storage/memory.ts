// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type {
  Storage,
  ManagedBotsStore,
  PresenceStore,
  SettingsStore,
  AccessStore,
  UsageStore,
  ProfileStore,
  SpendStore,
  ObservabilityStore,
  UsersStore,
  ChatsStore,
  ConversationsStore,
  PhotosStore,
  RemindersStore,
  PrivateChatsStore,
  ChecksStore,
  FactsStore,
  FeedbackStore,
} from "./types";
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
import type { DateFormat } from "../shared/date-format";
import type { Reminder } from "../reminders/types";
import type { RecurringCheck } from "../checks/types";
import type { FeedbackEntry } from "../shared/types/feedback";
import type { ManagedBot } from "../managed-bots/types";
import { MemoryManagedBotsStore } from "./memory/managed-bots";
import { MemoryPresenceStore } from "./memory/presence";
import { MemorySettingsStore } from "./memory/settings";
import { MemoryAccessStore } from "./memory/access";
import { MemoryUsageStore } from "./memory/usage";
import { MemoryProfileStore } from "./memory/profile";
import { MemorySpendStore } from "./memory/spend";
import { MemoryObservabilityStore } from "./memory/observability";
import { MemoryUsersStore } from "./memory/users";
import { MemoryChatsStore } from "./memory/chats";
import { MemoryConversationsStore } from "./memory/conversations";
import { MemoryPhotosStore } from "./memory/photos";
import { MemoryRemindersStore } from "./memory/reminders";
import { MemoryPrivateChatsStore } from "./memory/private-chats";
import { MemoryChecksStore } from "./memory/checks";
import { MemoryFactsStore } from "./memory/facts";
import { MemoryFeedbackStore } from "./memory/feedback";

// All mutable state lives in one object shared by reference across every
// `forBot` view, so a managed bot's storage and the main bot's storage see the
// same maps — they differ only by the scope prefix applied to per-character
// keys. `settings` is wrapped in a holder so the scalar can be shared too.
export type Backing = {
  settings: { value: Settings | null };
  whitelist: Record<WhitelistKind, Map<string, WhitelistEntry>>;
  // Blacklist, keyed by userId / chatId (global — not affected by `forBot`).
  blacklist: Record<WhitelistKind, Map<string, WhitelistEntry>>;
  // Per-user usage, keyed by userId (global — not affected by `forBot` scope).
  usage: Map<string, UserUsage>;
  conversations: Map<string, ConversationNode>;
  guestThreads: Map<string, GuestThreadNode>;
  userNames: Map<string, string>;
  userTimezones: Map<string, string>;
  userGenders: Map<string, Gender>;
  userLangs: Map<string, Lang>;
  userDateFormats: Map<string, DateFormat>;
  userSpend: Map<string, Map<string, number>>;
  chatSpend: Map<string, Map<string, number>>;
  globalSpend: Map<string, number>;
  modelSpend: Map<string, Map<string, number>>;
  spendModels: Set<string>;
  unpricedModels: Set<string>;
  // kind -> (UTC date -> set of entity ids that spent that day). Bounds the
  // spike scan to today's real spenders.
  spendActive: {
    user: Map<string, Set<string>>;
    chat: Map<string, Set<string>>;
  };
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
  // `/feedback` submissions, keyed by id (global — not affected by `forBot`).
  feedback: Map<string, FeedbackEntry>;
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
    blacklist: { users: new Map(), chats: new Map() },
    usage: new Map(),
    conversations: new Map(),
    guestThreads: new Map(),
    userNames: new Map(),
    userTimezones: new Map(),
    userGenders: new Map(),
    userLangs: new Map(),
    userDateFormats: new Map(),
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
    feedback: new Map(),
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

// What a per-character domain needs to address the shared backing: `sk` builds
// a scoped key, `inScope` recognises one built for this view (the
// iteration-based reminder lookups scan the shared map). Global domains take
// neither — they key the backing directly, so every view sees the same rows.
export type Scope = {
  sk(base: string): string;
  inScope(key: string): boolean;
  // The prefix of an arbitrary scope, for a query that spans the whole bot
  // family rather than this view alone (the per-user reminder cap).
  prefixFor(botId: string | null): string;
};

export class MemoryStorage implements Storage {
  private readonly b: Backing;
  // "" for the main bot (legacy scope), the managed bot's id otherwise.
  private readonly scope: string;

  readonly managedBots: ManagedBotsStore;
  readonly presence: PresenceStore;
  readonly settings: SettingsStore;
  readonly access: AccessStore;
  readonly usage: UsageStore;
  readonly profile: ProfileStore;
  readonly spend: SpendStore;
  readonly observability: ObservabilityStore;
  readonly users: UsersStore;
  readonly chats: ChatsStore;
  readonly conversations: ConversationsStore;
  readonly photos: PhotosStore;
  readonly reminders: RemindersStore;
  readonly privateChats: PrivateChatsStore;
  readonly checks: ChecksStore;
  readonly facts: FactsStore;
  readonly feedback: FeedbackStore;

  constructor(backing?: Backing, scope = "") {
    const b = backing ?? createBacking();
    this.b = b;
    this.scope = scope;

    // Per-character-scoped key. The main bot (`scope === ""`) and managed bots
    // never collide because the scope token is fixed-width-delimited.
    const prefix = `${scope}${SCOPE_SEP}`;
    const s: Scope = {
      sk: (base) => `${prefix}${base}`,
      inScope: (key) => key.startsWith(prefix),
      prefixFor: (botId) => `${botId ?? ""}${SCOPE_SEP}`,
    };

    this.managedBots = new MemoryManagedBotsStore(b);
    this.presence = new MemoryPresenceStore(b);
    this.settings = new MemorySettingsStore(b);
    this.access = new MemoryAccessStore(b);
    this.usage = new MemoryUsageStore(b);
    this.profile = new MemoryProfileStore(b);
    this.spend = new MemorySpendStore(b);
    this.observability = new MemoryObservabilityStore(b);
    this.users = new MemoryUsersStore(b);
    this.chats = new MemoryChatsStore(b);
    this.conversations = new MemoryConversationsStore(b, s);
    this.photos = new MemoryPhotosStore(b, s);
    this.reminders = new MemoryRemindersStore(b, s);
    this.privateChats = new MemoryPrivateChatsStore(b, s);
    this.checks = new MemoryChecksStore(b);
    this.facts = new MemoryFactsStore(b, s);
    this.feedback = new MemoryFeedbackStore(b);
  }

  // The new view shares this instance's backing object by reference: it is a
  // different scope over the same maps, never a copy of the store.
  forBot(botId: string | null): Storage {
    const scope = botId ?? "";
    if (scope === this.scope) return this;
    return new MemoryStorage(this.b, scope);
  }
}
