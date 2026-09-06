// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { WhitelistEntry, WhitelistKind } from "../../shared/types";
import type { AccessStore } from "../types/access";
import type { Backing } from "../memory";

export class MemoryAccessStore implements AccessStore {
  constructor(private readonly b: Backing) {}

  async listWhitelist(kind: WhitelistKind): Promise<WhitelistEntry[]> {
    return [...this.b.whitelist[kind].values()];
  }

  async addWhitelist(
    kind: WhitelistKind,
    entry: WhitelistEntry,
  ): Promise<void> {
    this.b.whitelist[kind].set(entry.id, { ...entry });
  }

  async removeWhitelist(kind: WhitelistKind, id: string): Promise<void> {
    this.b.whitelist[kind].delete(id);
  }

  async isWhitelisted(kind: WhitelistKind, id: string): Promise<boolean> {
    return this.b.whitelist[kind].has(id);
  }

  async listBlacklist(kind: WhitelistKind): Promise<WhitelistEntry[]> {
    return [...this.b.blacklist[kind].values()];
  }

  async addBlacklist(
    kind: WhitelistKind,
    entry: WhitelistEntry,
  ): Promise<void> {
    this.b.blacklist[kind].set(entry.id, { ...entry });
  }

  async removeBlacklist(kind: WhitelistKind, id: string): Promise<void> {
    this.b.blacklist[kind].delete(id);
  }

  async isBlacklisted(kind: WhitelistKind, id: string): Promise<boolean> {
    return this.b.blacklist[kind].has(id);
  }
}
