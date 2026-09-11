// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { RedisClient } from "bun";
import type { Storage } from "./types";
import {
  PREFIX,
  botPrefixFor,
  type ScopedKey,
  type ScopedKeyFor,
} from "./keydb/shared";
import { KeyDBManagedBotsStore } from "./keydb/managed-bots";
import { KeyDBPresenceStore } from "./keydb/presence";
import { KeyDBSettingsStore } from "./keydb/settings";
import { KeyDBAccessStore } from "./keydb/access";
import { KeyDBUsageStore } from "./keydb/usage";
import { KeyDBProfileStore } from "./keydb/profile";
import { KeyDBSpendStore } from "./keydb/spend";
import { KeyDBObservabilityStore } from "./keydb/observability";
import { KeyDBUsersStore } from "./keydb/users";
import { KeyDBChatsStore } from "./keydb/chats";
import { KeyDBConversationsStore } from "./keydb/conversations";
import { KeyDBPhotosStore } from "./keydb/photos";
import { KeyDBRemindersStore } from "./keydb/reminders";
import { KeyDBPrivateChatsStore } from "./keydb/private-chats";
import { KeyDBChecksStore } from "./keydb/checks";
import { KeyDBFactsStore } from "./keydb/facts";
import { KeyDBFeedbackStore } from "./keydb/feedback";

export class KeyDBStorage implements Storage {
  readonly managedBots: KeyDBManagedBotsStore;
  readonly presence: KeyDBPresenceStore;
  readonly settings: KeyDBSettingsStore;
  readonly access: KeyDBAccessStore;
  readonly usage: KeyDBUsageStore;
  readonly profile: KeyDBProfileStore;
  readonly spend: KeyDBSpendStore;
  readonly observability: KeyDBObservabilityStore;
  readonly users: KeyDBUsersStore;
  readonly chats: KeyDBChatsStore;
  readonly conversations: KeyDBConversationsStore;
  readonly photos: KeyDBPhotosStore;
  readonly reminders: KeyDBRemindersStore;
  readonly privateChats: KeyDBPrivateChatsStore;
  readonly checks: KeyDBChecksStore;
  readonly facts: KeyDBFactsStore;
  readonly feedback: KeyDBFeedbackStore;

  // `botPrefix` is "" for the main bot (legacy unprefixed keys) or
  // `mbot:{botId}:` for a managed bot. It is interposed between the global
  // `at:` prefix and the entity segment for per-character data only.
  constructor(
    private readonly client: RedisClient,
    private readonly botPrefix: string = "",
  ) {
    // Built once and handed to the per-character domains; the globally scoped
    // ones ignore it and key off `PREFIX` directly. `forBot(null)` keeps
    // `botPrefix === ""`, so a scoped key is byte-identical to the original
    // `${PREFIX}${base}` for the main bot.
    const sk: ScopedKey = (base) => `${PREFIX}${botPrefix}${base}`;
    const skFor: ScopedKeyFor = (botId, base) =>
      `${PREFIX}${botPrefixFor(botId)}${base}`;

    this.managedBots = new KeyDBManagedBotsStore(client);
    this.presence = new KeyDBPresenceStore(client);
    this.settings = new KeyDBSettingsStore(client);
    this.access = new KeyDBAccessStore(client);
    this.usage = new KeyDBUsageStore(client);
    this.profile = new KeyDBProfileStore(client);
    this.spend = new KeyDBSpendStore(client);
    this.observability = new KeyDBObservabilityStore(client);
    this.users = new KeyDBUsersStore(client);
    this.chats = new KeyDBChatsStore(client);
    this.conversations = new KeyDBConversationsStore(client, sk);
    this.photos = new KeyDBPhotosStore(client, sk);
    this.reminders = new KeyDBRemindersStore(client, sk, skFor);
    this.privateChats = new KeyDBPrivateChatsStore(client, sk);
    this.checks = new KeyDBChecksStore(client);
    this.facts = new KeyDBFactsStore(client, sk);
    this.feedback = new KeyDBFeedbackStore(client);
  }

  static async connect(url: string): Promise<KeyDBStorage> {
    const client = new RedisClient(url);
    await client.connect();
    return new KeyDBStorage(client);
  }

  forBot(botId: string | null): Storage {
    const prefix = botPrefixFor(botId);
    if (prefix === this.botPrefix) return this;
    return new KeyDBStorage(this.client, prefix);
  }
}
