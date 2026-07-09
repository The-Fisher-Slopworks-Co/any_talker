// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { SpendSummary } from "../spending/window";

export type SpikeConfig = {
  // Absolute floor: today's spend at or above this is a spike regardless of history.
  absoluteUsd: number;
  // Velocity: today at or above `baseline × this` is a spike (a sudden jump).
  velocityMultiplier: number;
  // Floor on the baseline so trivial amounts (a few cents) can't trip velocity.
  minBaselineUsd: number;
};

// "Sudden overspend" for one user or chat, from its day/week/month summary — the
// two signals the user asked for, OR'd: an absolute threshold catches "too much
// in absolute terms", velocity-vs-own-baseline catches "a sharp jump" even below
// the absolute bar. The baseline is the trailing 6-day daily average (the week
// window minus today, over 6 days), floored by `minBaselineUsd` so a near-zero
// history doesn't make any spend look like an infinite multiple.
export function detectSpike(
  summary: SpendSummary,
  cfg: SpikeConfig,
): { isSpike: boolean; baseline: number } {
  const baseline = Math.max((summary.week - summary.day) / 6, cfg.minBaselineUsd);
  const isSpike =
    summary.day >= cfg.absoluteUsd ||
    summary.day >= baseline * cfg.velocityMultiplier;
  return { isSpike, baseline };
}
