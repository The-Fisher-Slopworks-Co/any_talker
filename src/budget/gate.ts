// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { Storage } from "../storage/types";
import type { CheckResult, RateLimiter } from "../ratelimit/types";
import type { BudgetDenyReason, Settings, WindowKind } from "../shared/types";
import { userRateLimit } from "../ratelimit/limit-class";
import type { BudgetCheckResult, BudgetGuard } from "./types";

export type GateVerdict =
  // `fromAllowance`: a regular user would have been denied, and this request
  // is drawn from the user's limit-class allowance instead.
  | { kind: "allowed"; fromAllowance: boolean }
  | { kind: "budgetLimited"; reason: BudgetDenyReason }
  | { kind: "rateLimited"; limitedBy: WindowKind; msUntilReset: number };

// Both gates in front of an AI turn: the USD budget (money) and the token rate
// limit (fairness). A user is first judged as a regular user — base token
// limits, every budget cap. A limit-class user who would be denied gets one
// more chance: while their class's token ceiling and monthly allowance both
// have room, the request goes ahead and is drawn from the allowance. The global
// monthly cap is absolute — no allowance gets past it.
//
// The guard counts its own denial metric, so a class user who then goes ahead
// on the allowance still shows up there: it measures regular-user denials.
export async function checkTurnGates(args: {
  storage: Storage;
  budgetGuard: BudgetGuard;
  rateLimiter: RateLimiter;
  settings: Settings;
  userId: string;
  chatId: string;
  isOwner: boolean;
  now: number;
}): Promise<GateVerdict> {
  const { storage, rateLimiter, settings, userId, now } = args;

  const budget = await args.budgetGuard.check(
    { userId, chatId: args.chatId, isOwner: args.isOwner, now },
    settings.budget,
  );
  if (!budget.allowed && budget.reason === "globalMonthly") {
    return { kind: "budgetLimited", reason: budget.reason };
  }

  const skipRateLimit = args.isOwner && settings.rateLimit.ownerExempt;
  const [limitClass, base] = await Promise.all([
    storage.limitClasses.get(userId),
    skipRateLimit
      ? Promise.resolve<CheckResult>({ allowed: true })
      : rateLimiter.check(userId, userRateLimit(settings, null, now), now),
  ]);
  const regular = regularVerdict(budget, base);
  if (regular.kind === "allowed" || limitClass === null) return regular;

  // Past the base token limit: the class's raised limit is the ceiling.
  if (!base.allowed) {
    const classed = await rateLimiter.check(
      userId,
      userRateLimit(settings, limitClass, now),
      now,
    );
    if (!classed.allowed) {
      return {
        kind: "rateLimited",
        limitedBy: classed.limitedBy,
        msUntilReset: classed.msUntilReset,
      };
    }
  }

  const spent = await storage.spend.getAllowanceMonth(userId, now);
  if (spent >= settings.limitClasses[limitClass].monthlyAllowanceUsd) {
    return regular;
  }
  return { kind: "allowed", fromAllowance: true };
}

// What a regular user gets; the budget denial wins when both gates deny.
function regularVerdict(
  budget: BudgetCheckResult,
  base: CheckResult,
): GateVerdict {
  if (!budget.allowed) return { kind: "budgetLimited", reason: budget.reason };
  if (!base.allowed) {
    return {
      kind: "rateLimited",
      limitedBy: base.limitedBy,
      msUntilReset: base.msUntilReset,
    };
  }
  return { kind: "allowed", fromAllowance: false };
}
