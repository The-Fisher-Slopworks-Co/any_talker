// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

export const PREFIX = "at:";

// Builds a per-character-scoped key. `forBot(null)` keeps the bot prefix empty,
// so this is byte-identical to the plain `${PREFIX}${base}` for the main bot; a
// managed bot inserts its `mbot:{botId}:` segment. Domains that are global
// regardless of the view build their keys from `PREFIX` directly instead.
export type ScopedKey = (base: string) => string;

// User/chat rows written before `firstSeenAt` existed have no such field; treat
// a missing value as epoch 0 so an existing entity is never mistaken for "new"
// (which would wrongly apply the new-user budget or surface it in the digest).
export function withFirstSeen<T extends { firstSeenAt: number }>(rec: T): T {
  if (typeof rec.firstSeenAt !== "number") {
    (rec as { firstSeenAt: number }).firstSeenAt = 0;
  }
  return rec;
}
