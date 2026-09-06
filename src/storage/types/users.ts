// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { User } from "../../shared/types";

// User directory (global, not affected by `forBot`).
export interface UsersStore {
  list(): Promise<User[]>;
  // Upserts the user directory row, preserving `firstSeenAt` across updates.
  // Returns `{ isNew: true }` only when no row existed before — the signal that
  // drives new-user detection and the new-user soft-start budget.
  upsert(user: User): Promise<{ isNew: boolean }>;
  get(id: string): Promise<User | null>;
}
