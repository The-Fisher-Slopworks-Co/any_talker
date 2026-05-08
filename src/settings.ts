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
  if (Array.isArray(s.models) && s.models.length > 0) return s;
  const legacy = (s as Settings & { model?: string }).model;
  const models =
    typeof legacy === "string" && legacy.length > 0
      ? [legacy]
      : DEFAULT_SETTINGS.models;
  return { ...s, models };
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
