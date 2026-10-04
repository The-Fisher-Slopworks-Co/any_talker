// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type {
  LimitClass,
  LimitClassConfig,
  Settings,
} from "../../../shared/types";
import { req } from "./http";

// The settings the server merges field by field (`webapp/routes/settings.ts`),
// so a patch may name just the fields that change. `limitClasses` merges one
// level deeper, per class; every other setting is replaced whole.
type MergedSettingsKey = "rateLimit" | "reasoningEffort" | "budget" | "anomaly";

export type SettingsPatch = Omit<
  Partial<Settings>,
  MergedSettingsKey | "limitClasses"
> & { [K in MergedSettingsKey]?: Partial<Settings[K]> } & {
  limitClasses?: { [C in LimitClass]?: Partial<LimitClassConfig> };
};

// `webapp/routes/settings.ts`
export const settingsApi = {
  getSettings: () => req<Settings>("GET", "/api/settings"),
  putSettings: (patch: SettingsPatch) =>
    req<Settings>("PUT", "/api/settings", patch),
  getPromptOptimizationTemplate: () =>
    req<{ template: string }>("GET", "/api/settings/prompt-optimization"),
};
