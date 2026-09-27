// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { RedisClient } from "bun";
import type {
  LimitClassEntry,
  LimitClassesStore,
} from "../types/limit-classes";
import { isLimitClass, type LimitClass } from "../../shared/types";
import { PREFIX } from "./shared";

// One hash, userId -> class number, so listing every assignment is one read.
const KEY = `${PREFIX}limit_class`;

// A field that isn't a known class reads as "no class" rather than applying
// multipliers from a value nobody set.
function parse(raw: string | null | undefined): LimitClass | null {
  const n = Number(raw);
  return isLimitClass(n) ? n : null;
}

export class KeyDBLimitClassesStore implements LimitClassesStore {
  constructor(private readonly client: RedisClient) {}

  async get(userId: string): Promise<LimitClass | null> {
    return parse(await this.client.hget(KEY, userId));
  }

  async set(userId: string, limitClass: LimitClass): Promise<void> {
    await this.client.hset(KEY, userId, String(limitClass));
  }

  async remove(userId: string): Promise<void> {
    await this.client.hdel(KEY, userId);
  }

  async list(): Promise<LimitClassEntry[]> {
    const all = await this.client.hgetall(KEY);
    const out: LimitClassEntry[] = [];
    for (const [userId, raw] of Object.entries(all)) {
      const limitClass = parse(raw);
      if (limitClass !== null) out.push({ userId, limitClass });
    }
    return out;
  }
}
