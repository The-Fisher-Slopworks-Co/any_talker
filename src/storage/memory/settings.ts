// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { Settings } from "../../shared/types";
import type { SettingsStore } from "../types/settings";
import type { Backing } from "../memory";

export class MemorySettingsStore implements SettingsStore {
  constructor(private readonly b: Backing) {}

  async get(): Promise<Settings | null> {
    return this.b.settings.value
      ? structuredClone(this.b.settings.value)
      : null;
  }

  async save(settings: Settings): Promise<void> {
    this.b.settings.value = structuredClone(settings);
  }
}
