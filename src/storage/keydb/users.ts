// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { RedisClient } from "bun";
import type { UsersStore } from "../types/users";
import type { User } from "../../shared/types";
import { PREFIX, withFirstSeen } from "./shared";

export class KeyDBUsersStore implements UsersStore {
  constructor(private readonly client: RedisClient) {}

  async list(): Promise<User[]> {
    const values = await this.client.hvals(`${PREFIX}users`);
    return values
      .map((raw) => withFirstSeen(JSON.parse(raw) as User))
      .sort((a, b) => b.lastSeenAt - a.lastSeenAt);
  }

  // Non-atomic read-merge (like the fire-and-forget upserts that call it): keep
  // the stored `firstSeenAt` if the row exists, else stamp the caller's. A rare
  // concurrent double-insert may report `isNew` twice, which downstream tolerates
  // (the new-group alert is `claimAlert`-deduped; the digest is firstSeenAt-derived).
  async upsert(user: User): Promise<{ isNew: boolean }> {
    const existingRaw = await this.client.hget(`${PREFIX}users`, user.id);
    const prev = existingRaw
      ? withFirstSeen(JSON.parse(existingRaw) as User)
      : null;
    const record: User = {
      ...user,
      firstSeenAt: prev ? prev.firstSeenAt : user.firstSeenAt,
    };
    await this.client.hset(`${PREFIX}users`, user.id, JSON.stringify(record));
    return { isNew: prev === null };
  }

  async get(id: string): Promise<User | null> {
    const raw = await this.client.hget(`${PREFIX}users`, id);
    return raw ? withFirstSeen(JSON.parse(raw) as User) : null;
  }
}
