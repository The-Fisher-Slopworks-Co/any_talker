// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { Storage } from "../storage/types";

// One AI reply's cost, recorded from every angle the budget guard and dashboard
// need: who spent it (user), where (chat), the running global total (the
// kill-switch source of truth), and which model drove it. Centralizing the
// fan-out here is why every LLM call site — /ask, guest mode, reminder delivery
// — records spend the same way instead of each remembering four storage calls.
export type SpendRecord = {
  userId: string;
  chatId: string;
  // The model that answered, or null when the caller doesn't know it. A null
  // model skips per-model attribution but still records user/chat/global spend.
  modelId: string | null;
  costUsd: number;
  // False when the model had no pricing (cost is a $0 floor) — flags the model
  // as unpriced so the owner learns the ledger under-counts.
  priced: boolean;
};

// Records `entry` across the user/chat/global/model ledgers (each a no-op for a
// non-positive cost) and flags an unpriced model regardless of cost — an
// unpriced reply's cost is $0 precisely because pricing is missing, so the flag
// must not be gated on cost. Best-effort by contract: callers wrap in `.catch`
// so a storage hiccup on display/enforcement accounting never fails a reply
// already produced.
export async function recordSpend(
  storage: Storage,
  entry: SpendRecord,
  nowMs: number,
): Promise<void> {
  const cost = entry.costUsd;
  await Promise.all([
    storage.addUserSpend(entry.userId, cost, nowMs),
    storage.addChatSpend(entry.chatId, cost, nowMs),
    storage.addGlobalSpend(cost, nowMs),
    entry.modelId
      ? storage.addModelSpend(entry.modelId, cost, nowMs)
      : Promise.resolve(),
  ]);
  if (entry.modelId && !entry.priced) {
    await storage.flagUnpricedModel(entry.modelId);
  }
}

// Bumps the per-user denial counter that feeds the "who hits limits most"
// ranking, fired on every budget/rate-limit denial. Fire-and-forget: this is
// observability, never worth failing (or delaying) the denial itself.
export function recordDenial(
  storage: Storage,
  userId: string,
  nowMs: number,
): void {
  void storage
    .incrementDenialCount(userId, nowMs)
    .catch((err) => console.error("recording denial failed:", err));
}
