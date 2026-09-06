// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { ManagedBotsStore } from "./types/managed-bots";
import type { PresenceStore } from "./types/presence";
import type { SettingsStore } from "./types/settings";
import type { AccessStore } from "./types/access";
import type { UsageStore } from "./types/usage";
import type { ProfileStore } from "./types/profile";
import type { SpendStore } from "./types/spend";
import type { ObservabilityStore } from "./types/observability";
import type { UsersStore } from "./types/users";
import type { ChatsStore } from "./types/chats";
import type { ConversationsStore } from "./types/conversations";
import type { PhotosStore } from "./types/photos";
import type { RemindersStore } from "./types/reminders";
import type { PrivateChatsStore } from "./types/private-chats";
import type { ChecksStore } from "./types/checks";
import type { FactsStore } from "./types/facts";

// Re-exported so a consumer can depend on one namespace instead of all of
// `Storage` — e.g. a helper that only reads profile fields takes a `ProfileStore`.
export type {
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
};

export interface Storage {
  // Returns a view of this storage scoped to a single bot's per-character data:
  // `conversations` (the conversation graph and guest threads), `reminders`,
  // `facts`, the album buffers inside `photos` and `privateChats` flags. `null`
  // is the main bot and yields the original unprefixed keys — byte-identical to
  // storage that never knew about scoping, so existing data and all current call
  // sites are unaffected. A managed bot's id namespaces those entities under an
  // `mbot:{botId}:` segment; every *other* namespace (`settings`, `access`,
  // `usage`, `users`/`chats`, `spend`, `profile`, the photo-bytes cache inside
  // `photos`, `checks`, `observability`, `presence`, the `managedBots` registry)
  // is shared across all scopes regardless of which view it is called on.
  forBot(botId: string | null): Storage;

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
}

export const USER_FACTS_MAX_PER_USER = 50;
