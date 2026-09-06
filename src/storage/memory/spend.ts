// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { SpendSummary } from "../../spending/window";
import {
  SPEND_RETENTION_DAYS,
  summarizeSpend,
  utcDateKey,
} from "../../spending/window";
import type { SpendStore } from "../types/spend";
import type { Backing } from "../memory";
import { pruneDateKeyed } from "./date-buckets";

// Accrue a positive cost into a per-UTC-date bucket map and prune buckets older
// than the retention window. Date keys are fixed-width, so a lexical `<` is a
// date comparison — shared by the user/chat/global/model spend ledgers.
function accrueDailyBucket(
  byDate: Map<string, number>,
  costUsd: number,
  nowMs: number,
): void {
  const key = utcDateKey(nowMs);
  byDate.set(key, (byDate.get(key) ?? 0) + costUsd);
  pruneDateKeyed(byDate, nowMs, SPEND_RETENTION_DAYS);
}

export class MemorySpendStore implements SpendStore {
  constructor(private readonly b: Backing) {}

  private nestedBucket(
    outer: Map<string, Map<string, number>>,
    id: string,
  ): Map<string, number> {
    let byDate = outer.get(id);
    if (!byDate) {
      byDate = new Map();
      outer.set(id, byDate);
    }
    return byDate;
  }

  private markActive(kind: "user" | "chat", id: string, nowMs: number): void {
    const byDate = this.b.spendActive[kind];
    const key = utcDateKey(nowMs);
    let set = byDate.get(key);
    if (!set) {
      set = new Set();
      byDate.set(key, set);
    }
    set.add(id);
    // Active-spender sets are only needed for the near-real-time spike scan.
    pruneDateKeyed(byDate, nowMs, 2);
  }

  async addUser(userId: string, costUsd: number, nowMs: number): Promise<void> {
    if (!(costUsd > 0)) return;
    accrueDailyBucket(
      this.nestedBucket(this.b.userSpend, userId),
      costUsd,
      nowMs,
    );
    this.markActive("user", userId, nowMs);
  }

  async getUser(userId: string, nowMs: number): Promise<SpendSummary> {
    return summarizeSpend(this.b.userSpend.get(userId) ?? new Map(), nowMs);
  }

  async addChat(chatId: string, costUsd: number, nowMs: number): Promise<void> {
    if (!(costUsd > 0)) return;
    accrueDailyBucket(
      this.nestedBucket(this.b.chatSpend, chatId),
      costUsd,
      nowMs,
    );
    this.markActive("chat", chatId, nowMs);
  }

  async getChat(chatId: string, nowMs: number): Promise<SpendSummary> {
    return summarizeSpend(this.b.chatSpend.get(chatId) ?? new Map(), nowMs);
  }

  async addGlobal(costUsd: number, nowMs: number): Promise<void> {
    if (!(costUsd > 0)) return;
    accrueDailyBucket(this.b.globalSpend, costUsd, nowMs);
  }

  async getGlobal(nowMs: number): Promise<SpendSummary> {
    return summarizeSpend(this.b.globalSpend, nowMs);
  }

  async addModel(
    modelId: string,
    costUsd: number,
    nowMs: number,
  ): Promise<void> {
    if (!(costUsd > 0)) return;
    accrueDailyBucket(
      this.nestedBucket(this.b.modelSpend, modelId),
      costUsd,
      nowMs,
    );
    this.b.spendModels.add(modelId);
  }

  async getModel(modelId: string, nowMs: number): Promise<SpendSummary> {
    return summarizeSpend(this.b.modelSpend.get(modelId) ?? new Map(), nowMs);
  }

  async listModels(): Promise<string[]> {
    return [...this.b.spendModels];
  }

  async flagUnpriced(modelId: string): Promise<void> {
    this.b.unpricedModels.add(modelId);
  }

  async listUnpriced(): Promise<string[]> {
    return [...this.b.unpricedModels];
  }

  async listActiveEntities(
    kind: "user" | "chat",
    nowMs: number,
  ): Promise<string[]> {
    const set = this.b.spendActive[kind].get(utcDateKey(nowMs));
    return set ? [...set] : [];
  }

  // Atomic by JS event-loop construction (no `await` between read and write),
  // mirroring the KeyDB Lua script: a concurrent second migration finds the
  // old buckets already deleted and never doubles a total.
  async moveChat(
    oldChatId: string,
    newChatId: string,
    _nowMs: number,
  ): Promise<void> {
    if (oldChatId === newChatId) return;
    const old = this.b.chatSpend.get(oldChatId);
    if (!old) return;
    const dest = this.nestedBucket(this.b.chatSpend, newChatId);
    for (const [date, usd] of old) {
      dest.set(date, (dest.get(date) ?? 0) + usd);
    }
    this.b.chatSpend.delete(oldChatId);
  }
}
