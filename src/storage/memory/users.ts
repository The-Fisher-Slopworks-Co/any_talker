// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { User } from "../../shared/types";
import type { UsersStore } from "../types/users";
import type { Backing } from "../memory";

export class MemoryUsersStore implements UsersStore {
  constructor(private readonly b: Backing) {}

  async list(): Promise<User[]> {
    return [...this.b.users.values()]
      .map((u) => ({ ...u }))
      .sort((a, b) => b.lastSeenAt - a.lastSeenAt);
  }

  async upsert(user: User): Promise<{ isNew: boolean }> {
    const existing = this.b.users.get(user.id);
    const isNew = existing === undefined;
    // Preserve the original first-seen instant; a legacy record without one is
    // treated as long-known (epoch 0), never "new".
    const firstSeenAt = existing
      ? (existing.firstSeenAt ?? 0)
      : user.firstSeenAt;
    this.b.users.set(user.id, { ...user, firstSeenAt });
    return { isNew };
  }

  async get(id: string): Promise<User | null> {
    const u = this.b.users.get(id);
    return u ? { ...u } : null;
  }
}
