// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

// Denial ranking, digest cadence and alert de-duplication (global, not affected
// by `forBot`).
export interface ObservabilityStore {
  // Per-user denial ranking for "who hits limits most" — incremented on every
  // budget/rate-limit denial. Prometheus deliberately carries no per-user label
  // (cardinality), so this is the only per-user denial signal. `topDenied`
  // returns the highest-denied users for the UTC date of `nowMs`.
  incrementDenial(userId: string, nowMs: number): Promise<void>;
  topDenied(
    nowMs: number,
    limit: number,
  ): Promise<Array<{ userId: string; count: number }>>;

  // Cadence bookkeeping for the periodic owner digest (last-sent timestamp).
  getDigestState(): Promise<{ lastSentAtMs: number } | null>;
  setDigestState(state: { lastSentAtMs: number }): Promise<void>;

  // One-shot idempotent alert claim: returns true only for the FIRST caller
  // within `ttlSeconds` for a given `key`, so an alert (global-cap breach, a
  // per-entity spike) is DM'd to the owner once per period rather than on every
  // request/scan that observes the same condition.
  claimAlert(key: string, ttlSeconds: number): Promise<boolean>;
}
