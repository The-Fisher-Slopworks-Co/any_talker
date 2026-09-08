// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { Reminder } from "../../reminders/types";
import type { ReminderParseFailureReason } from "../../reminders/parse";

// A stored reminder the parser rejected. The `raw` payload is kept verbatim —
// the user's reminder text and its conversation snapshot — so a validation bug
// is an outage, not a data loss: the record can be inspected and replayed once
// the parser is fixed.
// How long a quarantined payload is kept before the backend expires it.
// Declared with the type rather than inside the KeyDB store: a reader has to
// know it too, to tell how much of the window is left to act in.
export const QUARANTINE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface QuarantinedReminder {
  id: string;
  raw: string;
  reason: ReminderParseFailureReason;
  quarantinedAtMs: number;
}

// Reminders. Scoped by `forBot`: each character keeps its own reminders.
export interface RemindersStore {
  save(reminder: Reminder): Promise<void>;
  fetchDue(nowMs: number): Promise<Reminder[]>;
  listForUser(userId: string): Promise<Reminder[]>;
  listAll(): Promise<Reminder[]>;
  // Fetch a single reminder by id (O(1)); null if absent or corrupt. Lets the
  // cancel tool verify ownership and read fireAtMs without an O(n) list scan.
  get(id: string): Promise<Reminder | null>;
  // Create a reminder only while the user is under `cap`, counting their
  // reminders in this scope plus every scope in `countBotIds` (the cap is
  // shared across the whole bot family). The count and the write happen
  // atomically, so the parallel tool calls of one model round cannot all read
  // the same pre-write count and overshoot the cap together.
  //
  // The count may be marginally high if a corrupted reminder left a dangling id
  // in the per-user index (the quarantine path can't reverse-map it to a user);
  // that makes the cap stricter, never looser.
  saveIfUnderCap(
    reminder: Reminder,
    cap: number,
    countBotIds: readonly (string | null)[],
  ): Promise<{ ok: true } | { ok: false; reason: "limit_reached" }>;
  delete(id: string, userId: string): Promise<void>;
  // Records the due path could not parse, newest first. Backends that hold
  // parsed objects rather than blobs cannot produce any and return [].
  listQuarantined(): Promise<QuarantinedReminder[]>;
}
