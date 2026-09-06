// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { RedisClient } from "bun";
import type { SettingsStore } from "../types/settings";
import type { Settings } from "../../shared/types";
import { PREFIX } from "./shared";

export class KeyDBSettingsStore implements SettingsStore {
  constructor(private readonly client: RedisClient) {}

  async get(): Promise<Settings | null> {
    const raw = await this.client.get(`${PREFIX}settings`);
    return raw ? (JSON.parse(raw) as Settings) : null;
  }

  async save(settings: Settings): Promise<void> {
    await this.client.set(`${PREFIX}settings`, JSON.stringify(settings));
  }
}
