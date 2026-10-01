// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { UserUsage } from "../../shared/types";

// Per-user dual-window spend in USD (5-hour + weekly). Global (not affected by
// `forBot`): one budget per user, shared across all chats and family bots.
export interface UsageStore {
  get(userId: string): Promise<UserUsage | null>;
  // Atomically accrues `usd` to both windows. The caller passes the current
  // start of each window (computed from the user's deterministic phase offset);
  // a stored window whose start differs has rolled over, so its `used` is reset
  // to 0 before the spend is added. Returns the updated record.
  add(
    userId: string,
    usd: number,
    fiveHourWindowStart: number,
    weeklyWindowStart: number,
  ): Promise<UserUsage>;
  // Clears the user's usage (admin reset): both windows drop to 0.
  reset(userId: string): Promise<void>;
  // Clears every user's usage at once (admin `/resetusage`). Returns how many
  // users had a stored record.
  resetAll(): Promise<number>;
}
