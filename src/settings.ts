// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { Storage } from "./storage/types";
import type { Settings, ChatSettings, RateLimitConfig } from "./shared/types";
import {
  DEFAULT_SETTINGS,
  isValidProviderSort,
  isValidProviderSlug,
  isValidServiceTier,
} from "./shared/types";

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

function normalize(s: Settings): Settings {
  let models = s.models;
  if (!Array.isArray(models) || models.length === 0) {
    const legacy = (s as Settings & { model?: string }).model;
    models =
      typeof legacy === "string" && legacy.length > 0
        ? [legacy]
        : DEFAULT_SETTINGS.models;
  }
  const timezone =
    typeof s.timezone === "string" && s.timezone.length > 0
      ? s.timezone
      : DEFAULT_SETTINGS.timezone;
  const providerSort = isValidProviderSort(s.providerSort) ? s.providerSort : null;
  const provider = isValidProviderSlug(s.provider) ? s.provider : null;
  const serviceTier = isValidServiceTier(s.serviceTier) ? s.serviceTier : null;
  const rateLimit = normalizeRateLimit(s.rateLimit);
  const expandableBlockquoteThreshold =
    typeof s.expandableBlockquoteThreshold === "number" &&
    Number.isFinite(s.expandableBlockquoteThreshold) &&
    s.expandableBlockquoteThreshold >= 0
      ? Math.floor(s.expandableBlockquoteThreshold)
      : DEFAULT_SETTINGS.expandableBlockquoteThreshold;
  return {
    ...s,
    models,
    timezone,
    providerSort,
    provider,
    serviceTier,
    rateLimit,
    expandableBlockquoteThreshold,
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
    // Rate limit is per-user and global; there is no per-chat override.
    rateLimit: global.rateLimit,
    timezone: chat.timezone ?? global.timezone,
    providerSort:
      chat.providerSort !== undefined ? chat.providerSort : global.providerSort,
    provider: chat.provider !== undefined ? chat.provider : global.provider,
    serviceTier:
      chat.serviceTier !== undefined ? chat.serviceTier : global.serviceTier,
    expandableBlockquoteThreshold: global.expandableBlockquoteThreshold,
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
