// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { Storage } from "../storage/types";
import type { BudgetConfig, BudgetDenyReason } from "../shared/types";
import type { BudgetGuard, BudgetCheckResult } from "./types";
import { budgetDeniedTotal } from "../metrics";

const MS_PER_DAY = 86_400_000;

// The hard USD safety net. Reads the live spend ledgers and denies the request
// when any applicable cap is at or over budget, most-severe-first so the
// reported reason is the top breach. The owner is never denied (when
// `ownerExempt`), but owner spend still counts toward the global totals — the
// money is real. All windowing math is the shared `spending/window.ts` day/week/
// month summary; this class is the thin Storage/metrics adapter, mirroring
// `DualWindowLimiter`.
export class SpendBudgetGuard implements BudgetGuard {
  constructor(private readonly storage: Storage) {}

  async check(
    args: { userId: string; chatId: string; isOwner: boolean; now: number },
    config: BudgetConfig,
  ): Promise<BudgetCheckResult> {
    if (!config.enabled) return { allowed: true };
    if (args.isOwner && config.ownerExempt) return { allowed: true };

    const { userId, chatId, now } = args;
    // The new-user cap needs the user's first-seen instant; skip the read
    // entirely when the soft-start window is disabled.
    const checkNewUser = config.newUserWindowDays > 0;
    const [global, chat, user] = await Promise.all([
      this.storage.getGlobalSpend(now),
      this.storage.getChatSpend(chatId, now),
      checkNewUser ? this.storage.getUser(userId) : Promise.resolve(null),
    ]);

    if (global.month >= config.globalMonthlyCapUsd) return this.deny("globalMonthly");
    if (global.day >= config.globalDailyCapUsd) return this.deny("globalDaily");
    if (chat.day >= config.perChatDailyCapUsd) return this.deny("chatDaily");

    // A user whose record hasn't been written yet (the upsert middleware runs
    // fire-and-forget) reads as null here and simply isn't held to the new-user
    // cap for that one request — the global/chat caps still bound them.
    if (
      checkNewUser &&
      user !== null &&
      now - user.firstSeenAt < config.newUserWindowDays * MS_PER_DAY
    ) {
      const userSpend = await this.storage.getUserSpend(userId, now);
      if (userSpend.day >= config.newUserDailyCapUsd) return this.deny("newUser");
    }

    return { allowed: true };
  }

  private deny(reason: BudgetDenyReason): BudgetCheckResult {
    budgetDeniedTotal.inc({ reason });
    return { allowed: false, reason };
  }
}
