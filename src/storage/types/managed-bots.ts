// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { ManagedBot } from "../../managed-bots/types";

// Managed-bot registry + token store. These are global (not affected by
// `forBot` scoping): the registry is owned by the main bot. Tokens are stored
// separately and never returned to the admin UI (write-only, like a secret).
export interface ManagedBotsStore {
  list(): Promise<ManagedBot[]>;
  get(botId: string): Promise<ManagedBot | null>;
  save(bot: ManagedBot): Promise<void>;
  delete(botId: string): Promise<void>;
  getToken(botId: string): Promise<string | null>;
  setToken(botId: string, token: string | null): Promise<void>;
}
