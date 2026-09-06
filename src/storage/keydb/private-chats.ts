// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { RedisClient } from "bun";
import type { PrivateChatsStore } from "../types/private-chats";
import type { ScopedKey } from "./shared";

export class KeyDBPrivateChatsStore implements PrivateChatsStore {
  constructor(
    private readonly client: RedisClient,
    private readonly sk: ScopedKey,
  ) {}

  async record(userId: string): Promise<void> {
    await this.client.set(this.sk(`user_private_chat:${userId}`), "1");
  }

  async has(userId: string): Promise<boolean> {
    const v = await this.client.get(this.sk(`user_private_chat:${userId}`));
    return v !== null;
  }
}
