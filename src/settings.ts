// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { Storage } from "./storage/types";
import type { Settings, ChatSettings, RateLimitConfig } from "./shared/types";
import { DEFAULT_SETTINGS } from "./shared/types";

export async function getOrInitSettings(storage: Storage): Promise<Settings> {
  const existing = await storage.getSettings();
  if (existing) return normalize(existing);
  await storage.saveSettings(DEFAULT_SETTINGS);
  return DEFAULT_SETTINGS;
}

function normalizeRateLimit(rl: RateLimitConfig): RateLimitConfig {
  const detailedMultiplier =
    typeof rl.detailedMultiplier === "number" && rl.detailedMultiplier > 0
      ? rl.detailedMultiplier
      : DEFAULT_SETTINGS.rateLimit.detailedMultiplier;
  const wiseMultiplier =
    typeof rl.wiseMultiplier === "number" && rl.wiseMultiplier > 0
      ? rl.wiseMultiplier
      : DEFAULT_SETTINGS.rateLimit.wiseMultiplier;
  return { ...rl, detailedMultiplier, wiseMultiplier };
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
  const providerSort =
    s.providerSort === "price" ||
    s.providerSort === "throughput" ||
    s.providerSort === "latency"
      ? s.providerSort
      : null;
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
    rateLimit: chat.rateLimit ? normalizeRateLimit(chat.rateLimit) : global.rateLimit,
    timezone: chat.timezone ?? global.timezone,
    providerSort:
      chat.providerSort !== undefined ? chat.providerSort : global.providerSort,
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
