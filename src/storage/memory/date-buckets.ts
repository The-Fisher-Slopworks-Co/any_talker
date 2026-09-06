// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { utcDateKey } from "../../spending/window";

// Drop entries whose fixed-width `YYYY-MM-DD` key is older than `retentionDays`.
// Shared by the spend ledgers and the denial ranking, which bucket by UTC date.
export function pruneDateKeyed(
  m: Map<string, unknown>,
  nowMs: number,
  retentionDays: number,
): void {
  const cutoff = utcDateKey(nowMs - retentionDays * 86_400_000);
  for (const k of m.keys()) {
    if (k < cutoff) m.delete(k);
  }
}
