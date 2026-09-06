// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { Reminder } from "../../reminders/types";

// Reminders. Scoped by `forBot`: each character keeps its own reminders.
export interface RemindersStore {
  save(reminder: Reminder): Promise<void>;
  fetchDue(nowMs: number): Promise<Reminder[]>;
  listForUser(userId: string): Promise<Reminder[]>;
  listAll(): Promise<Reminder[]>;
  // Fetch a single reminder by id (O(1)); null if absent or corrupt. Lets the
  // cancel tool verify ownership and read fireAtMs without an O(n) list scan.
  get(id: string): Promise<Reminder | null>;
  // Count a user's reminders (O(1) via SCARD) for the per-user creation cap.
  // May over-count slightly if a corrupted reminder left a dangling id in the
  // index (the quarantine path can't reverse-map it to a user) — that only makes
  // the cap marginally stricter, never looser, which is fine for a soft cap.
  countForUser(userId: string): Promise<number>;
  delete(id: string, userId: string): Promise<void>;
}
