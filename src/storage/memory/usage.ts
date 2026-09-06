// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { UserUsage } from "../../shared/types";
import type { UsageStore } from "../types/usage";
import type { Backing } from "../memory";

export class MemoryUsageStore implements UsageStore {
  constructor(private readonly b: Backing) {}

  async get(userId: string): Promise<UserUsage | null> {
    const v = this.b.usage.get(userId);
    return v ? { fiveHour: { ...v.fiveHour }, weekly: { ...v.weekly } } : null;
  }

  // Atomic by JS event-loop construction: there is no `await` between the read
  // and write of `this.b.usage`, so concurrent callers cannot interleave — the
  // same guarantee the KeyDB Lua script gives. WARNING: do not introduce an
  // `await` between the `.get(userId)` and the `.set(userId, ...)` below; doing
  // so silently breaks the atomicity invariant and no test catches it. If you
  // need async work, do it before the read or after the write.
  async add(
    userId: string,
    tokens: number,
    fiveHourWindowStart: number,
    weeklyWindowStart: number,
  ): Promise<UserUsage> {
    const current = this.b.usage.get(userId);
    const fiveUsed =
      current && current.fiveHour.windowStart === fiveHourWindowStart
        ? current.fiveHour.used + tokens
        : tokens;
    const weeklyUsed =
      current && current.weekly.windowStart === weeklyWindowStart
        ? current.weekly.used + tokens
        : tokens;
    const next: UserUsage = {
      fiveHour: { windowStart: fiveHourWindowStart, used: fiveUsed },
      weekly: { windowStart: weeklyWindowStart, used: weeklyUsed },
    };
    this.b.usage.set(userId, next);
    return { fiveHour: { ...next.fiveHour }, weekly: { ...next.weekly } };
  }

  async reset(userId: string): Promise<void> {
    this.b.usage.delete(userId);
  }
}
