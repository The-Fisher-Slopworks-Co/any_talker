// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { PrivateChatsStore } from "../types/private-chats";
import type { Backing, Scope } from "../memory";

export class MemoryPrivateChatsStore implements PrivateChatsStore {
  constructor(
    private readonly b: Backing,
    private readonly scope: Scope,
  ) {}

  async record(userId: string): Promise<void> {
    this.b.privateChats.add(this.scope.sk(userId));
  }

  async has(userId: string): Promise<boolean> {
    return this.b.privateChats.has(this.scope.sk(userId));
  }
}
