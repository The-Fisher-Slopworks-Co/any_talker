// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type {
  FeedbackEntry,
  FeedbackStatus,
} from "../../shared/types/feedback";

// Default page size and the ceiling a caller's `limit` is clamped to: a record
// carries thread snapshots, so an unbounded page is a large response.
const FEEDBACK_PAGE_SIZE = 25;
const FEEDBACK_PAGE_MAX = 100;

export function clampFeedbackLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) return FEEDBACK_PAGE_SIZE;
  return Math.min(Math.max(Math.trunc(limit), 1), FEEDBACK_PAGE_MAX);
}

export type FeedbackListQuery = {
  // Only records in this state; omitted means every state.
  status?: FeedbackStatus;
  limit?: number;
  // `nextCursor` from the previous page — the `createdAt` of its last record,
  // exclusive so that record is not returned twice. Two records sharing a
  // millisecond would cost the second its page; the daily cap makes that
  // collision vanishingly unlikely.
  cursor?: number;
};

export type FeedbackPage = {
  // Newest first.
  entries: FeedbackEntry[];
  // Pass back as `cursor`; null when this was the last page.
  nextCursor: number | null;
};

// `/feedback` submissions. Global — not affected by `forBot`: the corpus is one
// body of reports across the whole bot family, and each record names the bot it
// came from. No TTL: a report outlives the nodes it snapshots, and is removed
// by hand from the admin UI.
export interface FeedbackStore {
  // Also the update path: changing `status` is `get` then `save`, as elsewhere.
  save(entry: FeedbackEntry): Promise<void>;
  get(id: string): Promise<FeedbackEntry | null>;
  list(query?: FeedbackListQuery): Promise<FeedbackPage>;
  delete(id: string): Promise<void>;

  // Anti-spam: counts one submission against the reporter's UTC day, returning
  // the new count for the caller to compare with its own cap. Not the token
  // rate limiter (feedback costs no tokens), and not in memory (a counter a
  // restart resets is not a daily cap).
  bumpDailyCount(userId: string, nowMs: number): Promise<number>;
}
