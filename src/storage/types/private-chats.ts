// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

// Flags marking that a user has an open DM with this bot. Scoped by `forBot`:
// having written to the main bot says nothing about a managed one.
export interface PrivateChatsStore {
  record(userId: string): Promise<void>;
  has(userId: string): Promise<boolean>;
}
