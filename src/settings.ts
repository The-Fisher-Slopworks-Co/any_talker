// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { Storage } from "./storage/types";
import type {
  Settings,
  ChatSettings,
  RateLimitConfig,
  BudgetConfig,
  AnomalyConfig,
} from "./shared/types";
import { DEFAULT_SETTINGS } from "./shared/types";

// Reads a non-negative finite number, falling back to `def`.
function num(v: unknown, def: number): number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : def;
}

// Reads a boolean, falling back to `def`.
function bool(v: unknown, def: boolean): boolean {
  return typeof v === "boolean" ? v : def;
}

// Reads a positive integer (>= 1), falling back to `def`.
function posInt(v: unknown, def: number): number {
  return typeof v === "number" && Number.isFinite(v) && v >= 1
    ? Math.floor(v)
    : def;
}

export async function getOrInitSettings(storage: Storage): Promise<Settings> {
  const existing = await storage.getSettings();
  if (existing) return normalize(existing);
  await storage.saveSettings(DEFAULT_SETTINGS);
  return DEFAULT_SETTINGS;
}

// Backfills the dual-window config from possibly-legacy stored shapes. A legacy
// token-bucket `capacity` (the old burst budget) maps to the 5-hour budget;
// everything else falls back to defaults. Tolerant of missing/invalid fields so
// old `at:settings` rows load without a migration (schema-on-read).
function normalizeRateLimit(
  rl: RateLimitConfig | undefined,
): RateLimitConfig {
  const def = DEFAULT_SETTINGS.rateLimit;
  const legacy = (rl ?? {}) as Partial<RateLimitConfig> & { capacity?: number };
  const fiveHourTokens =
    typeof legacy.fiveHourTokens === "number" && legacy.fiveHourTokens >= 0
      ? legacy.fiveHourTokens
      : typeof legacy.capacity === "number" && legacy.capacity >= 0
        ? legacy.capacity
        : def.fiveHourTokens;
  const weeklyTokens =
    typeof legacy.weeklyTokens === "number" && legacy.weeklyTokens >= 0
      ? legacy.weeklyTokens
      : def.weeklyTokens;
  const ownerExempt =
    typeof legacy.ownerExempt === "boolean" ? legacy.ownerExempt : def.ownerExempt;
  // /askwise must never cost less than /ask, so the multiplier is floored at 1.
  const wiseMultiplier =
    typeof legacy.wiseMultiplier === "number" && legacy.wiseMultiplier >= 1
      ? legacy.wiseMultiplier
      : def.wiseMultiplier;
  return { fiveHourTokens, weeklyTokens, ownerExempt, wiseMultiplier };
}

// Backfills the USD budget caps from a possibly-legacy/absent stored shape.
// Tolerant of missing/invalid fields so old `at:settings` rows load without a
// migration (schema-on-read), same as `normalizeRateLimit`.
function normalizeBudget(b: BudgetConfig | undefined): BudgetConfig {
  const def = DEFAULT_SETTINGS.budget;
  const legacy = (b ?? {}) as Partial<BudgetConfig>;
  return {
    enabled: bool(legacy.enabled, def.enabled),
    ownerExempt: bool(legacy.ownerExempt, def.ownerExempt),
    globalMonthlyCapUsd: num(legacy.globalMonthlyCapUsd, def.globalMonthlyCapUsd),
    globalDailyCapUsd: num(legacy.globalDailyCapUsd, def.globalDailyCapUsd),
    perChatDailyCapUsd: num(legacy.perChatDailyCapUsd, def.perChatDailyCapUsd),
    newUserDailyCapUsd: num(legacy.newUserDailyCapUsd, def.newUserDailyCapUsd),
    newUserWindowDays: posInt(legacy.newUserWindowDays, def.newUserWindowDays),
  };
}

// Backfills the anomaly-detection thresholds (alert-only), same approach.
function normalizeAnomaly(a: AnomalyConfig | undefined): AnomalyConfig {
  const def = DEFAULT_SETTINGS.anomaly;
  const legacy = (a ?? {}) as Partial<AnomalyConfig>;
  return {
    digestIntervalHours: posInt(legacy.digestIntervalHours, def.digestIntervalHours),
    spikeUserAbsoluteUsd: num(legacy.spikeUserAbsoluteUsd, def.spikeUserAbsoluteUsd),
    spikeChatAbsoluteUsd: num(legacy.spikeChatAbsoluteUsd, def.spikeChatAbsoluteUsd),
    // A multiplier below 1 would flag every spender; floor it at 1.
    spikeVelocityMultiplier:
      typeof legacy.spikeVelocityMultiplier === "number" &&
      legacy.spikeVelocityMultiplier >= 1
        ? legacy.spikeVelocityMultiplier
        : def.spikeVelocityMultiplier,
    spikeMinBaselineUsd: num(legacy.spikeMinBaselineUsd, def.spikeMinBaselineUsd),
  };
}

function normalize(s: Settings): Settings {
  let models = s.models;
  if (!Array.isArray(models) || models.length === 0) {
    const legacy = (s as Settings & { model?: string }).model;
    models =
      typeof legacy === "string" && legacy.length > 0
        ? [legacy]
        : DEFAULT_SETTINGS.models;
  }
  const whitelistEnabled = bool(
    s.whitelistEnabled,
    DEFAULT_SETTINGS.whitelistEnabled,
  );
  const timezone =
    typeof s.timezone === "string" && s.timezone.length > 0
      ? s.timezone
      : DEFAULT_SETTINGS.timezone;
  const rateLimit = normalizeRateLimit(s.rateLimit);
  const budget = normalizeBudget(s.budget);
  const anomaly = normalizeAnomaly(s.anomaly);
  const expandableBlockquoteThreshold =
    typeof s.expandableBlockquoteThreshold === "number" &&
    Number.isFinite(s.expandableBlockquoteThreshold) &&
    s.expandableBlockquoteThreshold >= 0
      ? Math.floor(s.expandableBlockquoteThreshold)
      : DEFAULT_SETTINGS.expandableBlockquoteThreshold;
  // A cap below 1 would block all reminder creation; reject any
  // non-positive/non-finite stored value and fall back to the default (50).
  const maxRemindersPerUser =
    typeof s.maxRemindersPerUser === "number" &&
    Number.isFinite(s.maxRemindersPerUser) &&
    s.maxRemindersPerUser >= 1
      ? Math.floor(s.maxRemindersPerUser)
      : DEFAULT_SETTINGS.maxRemindersPerUser;
  // Field-by-field return (no `...s` spread) so legacy OpenRouter-era fields
  // (providerSort / provider / serviceTier) are dropped on read and never
  // re-persisted — schema-on-read, no migration.
  return {
    systemPrompt:
      typeof s.systemPrompt === "string"
        ? s.systemPrompt
        : DEFAULT_SETTINGS.systemPrompt,
    models,
    whitelistEnabled,
    rateLimit,
    budget,
    anomaly,
    timezone,
    expandableBlockquoteThreshold,
    maxRemindersPerUser,
  };
}

export function applyChatOverrides(
  global: Settings,
  chat: ChatSettings | null,
): Settings {
  if (!chat) return global;
  return {
    systemPrompt: chat.systemPrompt ?? global.systemPrompt,
    models: chat.models ?? global.models,
    // Access-gate policy is global, like the rate limit; no per-chat override.
    whitelistEnabled: global.whitelistEnabled,
    // Rate limit is per-user and global; there is no per-chat override.
    rateLimit: global.rateLimit,
    // Budget caps and anomaly thresholds are global policy, like the rate
    // limit; a per-chat override would let the per-chat cap be sidestepped.
    budget: global.budget,
    anomaly: global.anomaly,
    timezone: chat.timezone ?? global.timezone,
    expandableBlockquoteThreshold: global.expandableBlockquoteThreshold,
    // The reminder cap is a global policy, like the rate limit; no per-chat override.
    maxRemindersPerUser: global.maxRemindersPerUser,
  };
}

export async function getEffectiveSettings(
  storage: Storage,
  chatId: string,
): Promise<Settings> {
  const [global, chat] = await Promise.all([
    getOrInitSettings(storage),
    storage.getChatSettings(chatId),
  ]);
  return applyChatOverrides(global, chat);
}
