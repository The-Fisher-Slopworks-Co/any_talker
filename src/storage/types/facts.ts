// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

// Per-user facts the bot remembers. Scoped by `forBot`: each character builds
// its own memory of a user.
export interface FactsStore {
  remember(
    userId: string,
    key: string,
    value: string,
  ): Promise<{ ok: true } | { ok: false; reason: "limit_reached" }>;
  list(userId: string): Promise<Array<{ key: string; value: string }>>;
  forget(userId: string, key: string): Promise<{ existed: boolean }>;
}
