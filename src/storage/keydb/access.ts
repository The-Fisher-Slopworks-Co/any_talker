// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { RedisClient } from "bun";
import type { AccessStore } from "../types/access";
import type { WhitelistEntry, WhitelistKind } from "../../shared/types";
import { PREFIX } from "./shared";

export class KeyDBAccessStore implements AccessStore {
  constructor(private readonly client: RedisClient) {}

  async listWhitelist(kind: WhitelistKind): Promise<WhitelistEntry[]> {
    const raw = await this.client.get(`${PREFIX}whitelist:${kind}`);
    return raw ? (JSON.parse(raw) as WhitelistEntry[]) : [];
  }

  async addWhitelist(
    kind: WhitelistKind,
    entry: WhitelistEntry,
  ): Promise<void> {
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

  // `blacklist:users` is the key the user-only blacklist already wrote, so
  // existing data keeps working unchanged; chats get their own sibling key.
  async listBlacklist(kind: WhitelistKind): Promise<WhitelistEntry[]> {
    const raw = await this.client.get(`${PREFIX}blacklist:${kind}`);
    return raw ? (JSON.parse(raw) as WhitelistEntry[]) : [];
  }

  async addBlacklist(
    kind: WhitelistKind,
    entry: WhitelistEntry,
  ): Promise<void> {
    const list = await this.listBlacklist(kind);
    const next = [...list.filter((e) => e.id !== entry.id), { ...entry }];
    await this.client.set(`${PREFIX}blacklist:${kind}`, JSON.stringify(next));
  }

  async removeBlacklist(kind: WhitelistKind, id: string): Promise<void> {
    const list = await this.listBlacklist(kind);
    const next = list.filter((e) => e.id !== id);
    await this.client.set(`${PREFIX}blacklist:${kind}`, JSON.stringify(next));
  }

  async isBlacklisted(kind: WhitelistKind, id: string): Promise<boolean> {
    const list = await this.listBlacklist(kind);
    return list.some((e) => e.id === id);
  }
}
