// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { utcDateKey } from "../../spending/window";
import type { ObservabilityStore } from "../types/observability";
import type { Backing } from "../memory";
import { pruneDateKeyed } from "./date-buckets";

export class MemoryObservabilityStore implements ObservabilityStore {
  constructor(private readonly b: Backing) {}

  async incrementDenial(userId: string, nowMs: number): Promise<void> {
    const key = utcDateKey(nowMs);
    let byUser = this.b.denialRank.get(key);
    if (!byUser) {
      byUser = new Map();
      this.b.denialRank.set(key, byUser);
    }
    byUser.set(userId, (byUser.get(userId) ?? 0) + 1);
    pruneDateKeyed(this.b.denialRank, nowMs, 9);
  }

  async topDenied(
    nowMs: number,
    limit: number,
  ): Promise<Array<{ userId: string; count: number }>> {
    const byUser = this.b.denialRank.get(utcDateKey(nowMs));
    if (!byUser) return [];
    return [...byUser.entries()]
      .map(([userId, count]) => ({ userId, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, Math.max(0, limit));
  }

  async getDigestState(): Promise<{ lastSentAtMs: number } | null> {
    return this.b.digestState.value ? { ...this.b.digestState.value } : null;
  }

  async setDigestState(state: { lastSentAtMs: number }): Promise<void> {
    this.b.digestState.value = { ...state };
  }

  async claimAlert(key: string, ttlSeconds: number): Promise<boolean> {
    const now = Date.now();
    const existing = this.b.alertClaims.get(key);
    if (existing !== undefined && existing > now) return false;
    this.b.alertClaims.set(key, now + ttlSeconds * 1000);
    return true;
  }
}
