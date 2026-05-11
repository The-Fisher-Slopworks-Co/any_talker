// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { Storage } from "./storage/types";
import type { Settings, ChatSettings } from "./shared/types";
import { DEFAULT_SETTINGS } from "./shared/types";

export async function getOrInitSettings(storage: Storage): Promise<Settings> {
  const existing = await storage.getSettings();
  if (existing) return normalize(existing);
  await storage.saveSettings(DEFAULT_SETTINGS);
  return DEFAULT_SETTINGS;
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
  return { ...s, models, timezone, providerSort };
}

export function applyChatOverrides(
  global: Settings,
  chat: ChatSettings | null,
): Settings {
  if (!chat) return global;
  return {
    systemPrompt: chat.systemPrompt ?? global.systemPrompt,
    models: chat.models ?? global.models,
    rateLimit: chat.rateLimit ?? global.rateLimit,
    timezone: chat.timezone ?? global.timezone,
    providerSort:
      chat.providerSort !== undefined ? chat.providerSort : global.providerSort,
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
