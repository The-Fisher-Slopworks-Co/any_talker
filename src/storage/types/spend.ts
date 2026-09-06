// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { SpendSummary } from "../../spending/window";

// Spend accounting (global, not affected by `forBot`).
export interface SpendStore {
  // Accrues `costUsd` to the user's spend for the UTC date of `nowMs`. A
  // non-positive cost is a no-op so free/uncosted replies don't create buckets.
  // Also records the user in the day's "active spenders" set (see
  // `listActiveEntities`).
  addUser(userId: string, costUsd: number, nowMs: number): Promise<void>;
  getUser(userId: string, nowMs: number): Promise<SpendSummary>;

  // Parallel per-chat / global / per-model spend accounting, same UTC-day
  // bucketing and retention as `addUser`. Written alongside it by
  // `spending/record.ts` so the budget guard and dashboard can see spend from
  // every angle (who / where / which model). All non-positive costs are no-ops.
  addChat(chatId: string, costUsd: number, nowMs: number): Promise<void>;
  getChat(chatId: string, nowMs: number): Promise<SpendSummary>;
  addGlobal(costUsd: number, nowMs: number): Promise<void>;
  getGlobal(nowMs: number): Promise<SpendSummary>;
  addModel(modelId: string, costUsd: number, nowMs: number): Promise<void>;
  getModel(modelId: string, nowMs: number): Promise<SpendSummary>;
  // Directory of every model id that has ever recorded spend (for the per-model
  // dashboard breakdown — model metadata itself lives in the ModelCatalog).
  listModels(): Promise<string[]>;

  // Records that a model answered without pricing data (cost computed as $0), so
  // the owner can be told their spend numbers are under-counting. Idempotent.
  flagUnpriced(modelId: string): Promise<void>;
  listUnpriced(): Promise<string[]>;

  // The user/chat ids that actually spent on the UTC date of `nowMs`. Bounds the
  // periodic spike scan to today's real spenders instead of every entity ever.
  listActiveEntities(kind: "user" | "chat", nowMs: number): Promise<string[]>;

  // Moves every retained per-day spend bucket from one chat ledger to another
  // (group→supergroup migration). Each day's move is atomic — concurrent
  // migrations (several family bots reacting to the same upgrade) must not
  // double the totals.
  moveChat(oldChatId: string, newChatId: string, nowMs: number): Promise<void>;
}
