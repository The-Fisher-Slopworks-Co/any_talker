// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { RedisClient } from "bun";
import type { ChecksStore } from "../types/checks";
import type { RecurringCheck } from "../../checks/types";
import { PREFIX } from "./shared";

export class KeyDBChecksStore implements ChecksStore {
  constructor(private readonly client: RedisClient) {}

  async save(check: RecurringCheck): Promise<void> {
    await this.client.hset(`${PREFIX}checks`, check.id, JSON.stringify(check));
  }

  async get(id: string): Promise<RecurringCheck | null> {
    const raw = await this.client.hget(`${PREFIX}checks`, id);
    return raw ? parseCheckJson(raw) : null;
  }

  async list(): Promise<RecurringCheck[]> {
    const values = await this.client.hvals(`${PREFIX}checks`);
    return values
      .map(parseCheckJson)
      .sort((a, b) => a.createdAtMs - b.createdAtMs);
  }

  async delete(id: string): Promise<void> {
    await this.client.hdel(`${PREFIX}checks`, id);
  }
}

// Backfill defaults for fields added after the initial schema so legacy
// records load with runtime types matching the static type.
function parseCheckJson(raw: string): RecurringCheck {
  const parsed = JSON.parse(raw) as RecurringCheck;
  return { ...parsed, counterAnchorDate: parsed.counterAnchorDate ?? null };
}
