// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { RedisClient } from "bun";
import type { ApiTokenRecord, ApiTokenStore } from "../types/api-token";
import { PREFIX } from "./shared";

const KEY = `${PREFIX}api_token`;

export class KeyDBApiTokenStore implements ApiTokenStore {
  constructor(private readonly client: RedisClient) {}

  async get(): Promise<ApiTokenRecord | null> {
    const raw = await this.client.get(KEY);
    return raw ? (JSON.parse(raw) as ApiTokenRecord) : null;
  }

  async save(record: ApiTokenRecord): Promise<void> {
    await this.client.set(KEY, JSON.stringify(record));
  }

  async clear(): Promise<void> {
    await this.client.del(KEY);
  }
}
