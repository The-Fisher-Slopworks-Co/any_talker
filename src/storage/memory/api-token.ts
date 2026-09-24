// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { ApiTokenRecord, ApiTokenStore } from "../types/api-token";
import type { Backing } from "../memory";

export class MemoryApiTokenStore implements ApiTokenStore {
  constructor(private readonly b: Backing) {}

  async get(): Promise<ApiTokenRecord | null> {
    const value = this.b.apiToken.value;
    return value ? { ...value } : null;
  }

  async save(record: ApiTokenRecord): Promise<void> {
    this.b.apiToken.value = { ...record };
  }

  async clear(): Promise<void> {
    this.b.apiToken.value = null;
  }
}
