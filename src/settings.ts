import type { Storage } from "./storage/types";
import type { Settings } from "./shared/types";
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
