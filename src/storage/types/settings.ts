// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { Settings } from "../../shared/types";

// Global bot settings (not affected by `forBot`).
export interface SettingsStore {
  get(): Promise<Settings | null>;
  save(settings: Settings): Promise<void>;
}
