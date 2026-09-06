// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { AnomalyConfig, BudgetConfig } from "./budget";
import type { ProviderSort, ServiceTier } from "./models";
import type { RateLimitConfig } from "./ratelimit";

export type Settings = {
  systemPrompt: string;
  // Model ids to try, most-preferred first. The trailing ids form OpenRouter's
  // server-side fallback chain, tried in order when the primary fails.
  models: string[];
  // Provider routing. `null` leaves the choice to OpenRouter.
  providerSort: ProviderSort | null;
  // Provider slug to pin routing to (e.g. "deepinfra/fp4"). When set it takes
  // precedence over `providerSort`: the request goes only to this provider with
  // no fallback.
  provider: string | null;
  serviceTier: ServiceTier | null;
  // Whether the user/chat whitelist is enforced as an access gate. When false,
  // anyone may invoke the bot and the USD budget guard + rate limit are the only
  // protection (the whitelist entries are preserved, just not consulted). The
  // owner is always allowed either way. Defaults to true (whitelist enforced).
  whitelistEnabled: boolean;
  rateLimit: RateLimitConfig;
  // Hard USD spend caps (the budget-protection safety net) and the alert-only
  // anomaly thresholds. Global policy like `rateLimit` — no per-chat override.
  budget: BudgetConfig;
  anomaly: AnomalyConfig;
  timezone: string;
  expandableBlockquoteThreshold: number;
  // Cap on how many reminders one user may hold at once, shared across the
  // whole bot family (main bot + every managed character). Creation past this
  // is rejected (not evicted — a reminder is a user-visible commitment). Bounds
  // list/cancel cost and the KeyDB keyspace, since reminders carry no TTL.
  // Configurable via PUT /api/settings; defaults to 5.
  maxRemindersPerUser: number;
};

export const DEFAULT_EXPANDABLE_BLOCKQUOTE_THRESHOLD = 500;

// Default per-user reminder cap (see `Settings.maxRemindersPerUser`). Mirrors
// the `USER_FACTS_MAX_PER_USER` precedent, but enforced as rejection rather than
// oldest-eviction.
const DEFAULT_MAX_REMINDERS_PER_USER = 5;

export const DEFAULT_SETTINGS: Settings = {
  systemPrompt: "You are a helpful assistant in a Telegram chat. Be concise.",
  models: ["anthropic/claude-sonnet-4-5"],
  providerSort: null,
  provider: null,
  serviceTier: null,
  whitelistEnabled: true,
  rateLimit: {
    fiveHourTokens: 30000,
    weeklyTokens: 300000,
    ownerExempt: true,
    wiseMultiplier: 1.8,
  },
  // Defaults sized for a small (~$20/month) budget: the monthly cap is the real
  // ceiling (with a little headroom), the daily cap stops one day from eating
  // the month, and per-chat/new-user caps keep any single chat or unknown
  // newcomer to a small slice. All tunable at runtime from the admin Mini App.
  budget: {
    enabled: true,
    ownerExempt: true,
    globalMonthlyCapUsd: 18,
    globalDailyCapUsd: 2,
    perChatDailyCapUsd: 1,
    newUserDailyCapUsd: 0.1,
    newUserWindowDays: 3,
  },
  anomaly: {
    digestIntervalHours: 24,
    spikeUserAbsoluteUsd: 0.5,
    spikeChatAbsoluteUsd: 1,
    spikeVelocityMultiplier: 5,
    spikeMinBaselineUsd: 0.02,
  },
  timezone: "UTC",
  expandableBlockquoteThreshold: DEFAULT_EXPANDABLE_BLOCKQUOTE_THRESHOLD,
  maxRemindersPerUser: DEFAULT_MAX_REMINDERS_PER_USER,
};
