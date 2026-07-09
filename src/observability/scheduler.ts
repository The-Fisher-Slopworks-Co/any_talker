// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { Storage } from "../storage/types";
import type { AnomalyConfig } from "../shared/types";
import {
  startIntervalScheduler,
  type IntervalScheduler,
} from "../shared/interval-scheduler";
import { getOrInitSettings } from "../settings";
import { utcDateKey } from "../spending/window";
import {
  gatherSpendOverview,
  userLabel,
  chatLabel,
  formatUsd,
} from "../spending/overview";
import { detectSpike, type SpikeConfig } from "./spike";
import { buildDigestText } from "./digest";
import type { NotifyApi } from "./types";
import { t, type Lang } from "../shared/i18n";

export type ObservabilityScheduler = IntervalScheduler;

export type ObservabilityTickDeps = {
  storage: Storage;
  api: NotifyApi;
  ownerId: string;
  nowMs: number;
};

// Spike-scan cadence (near-real-time alarms). The digest cadence is separate and
// admin-configurable (`AnomalyConfig.digestIntervalHours`); this only bounds how
// often we look. Fixed in code like the reminder/checks scheduler intervals.
const DEFAULT_INTERVAL_MS = 5 * 60_000;
// Digest rows shown per section.
const DIGEST_LIMIT = 5;
// One alert per subject per UTC day (a bit over 24h to bridge day boundaries).
// Exported so the dispatcher's global-cap-breach alert dedupes on the same window.
export const ALERT_TTL_SECONDS = 26 * 60 * 60;

// One tick: scan today's spenders for spikes (instant, deduped DMs), then send
// the periodic digest if it's due. Pure-ish and injectable, mirroring
// `runReminderTick`/`runChecksTick`.
export async function runObservabilityTick(
  deps: ObservabilityTickDeps,
): Promise<void> {
  const settings = await getOrInitSettings(deps.storage);
  const lang = (await deps.storage.getUserLang(deps.ownerId)) ?? "en";
  await scanSpikes(deps, settings.anomaly, lang);
  await maybeSendDigest(deps, settings.anomaly, lang);
}

async function scanSpikes(
  deps: ObservabilityTickDeps,
  anomaly: AnomalyConfig,
  lang: Lang,
): Promise<void> {
  const base = {
    velocityMultiplier: anomaly.spikeVelocityMultiplier,
    minBaselineUsd: anomaly.spikeMinBaselineUsd,
  };
  await Promise.all([
    scanKind(deps, "user", { ...base, absoluteUsd: anomaly.spikeUserAbsoluteUsd }, lang),
    scanKind(deps, "chat", { ...base, absoluteUsd: anomaly.spikeChatAbsoluteUsd }, lang),
  ]);
}

async function scanKind(
  deps: ObservabilityTickDeps,
  kind: "user" | "chat",
  cfg: SpikeConfig,
  lang: Lang,
): Promise<void> {
  const ids = await deps.storage.listSpendActiveEntities(kind, deps.nowMs);
  await Promise.all(
    ids.map(async (id) => {
      const summary =
        kind === "user"
          ? await deps.storage.getUserSpend(id, deps.nowMs)
          : await deps.storage.getChatSpend(id, deps.nowMs);
      const { isSpike, baseline } = detectSpike(summary, cfg);
      if (!isSpike) return;
      const claimed = await deps.storage.claimAlert(
        `spike:${kind}:${id}:${utcDateKey(deps.nowMs)}`,
        ALERT_TTL_SECONDS,
      );
      if (!claimed) return;
      const label = await resolveLabel(deps.storage, kind, id);
      await deps.api
        .sendMessage(
          deps.ownerId,
          t(lang).bot_owner_spike(
            kind,
            label,
            formatUsd(summary.day),
            formatUsd(baseline),
          ),
        )
        .catch((err) => console.error("[observability] spike DM failed:", err));
    }),
  );
}

async function resolveLabel(
  storage: Storage,
  kind: "user" | "chat",
  id: string,
): Promise<string> {
  if (kind === "user") {
    const u = await storage.getUser(id);
    return u ? userLabel(u) : id;
  }
  const c = await storage.getChat(id);
  return c ? chatLabel(c) : id;
}

async function maybeSendDigest(
  deps: ObservabilityTickDeps,
  anomaly: AnomalyConfig,
  lang: Lang,
): Promise<void> {
  const state = await deps.storage.getDigestState();
  // First run establishes the cadence baseline; the first digest fires one
  // interval later (no immediate "startup" digest).
  if (state === null) {
    await deps.storage.setDigestState({ lastSentAtMs: deps.nowMs });
    return;
  }
  const intervalMs = anomaly.digestIntervalHours * 60 * 60 * 1000;
  if (deps.nowMs - state.lastSentAtMs < intervalMs) return;

  const overview = await gatherSpendOverview(deps.storage, deps.nowMs, {
    limit: DIGEST_LIMIT,
    newSinceMs: state.lastSentAtMs,
  });
  const text = buildDigestText(overview, lang);
  // Advance the clock whether or not we send, so a quiet interval doesn't cause
  // a re-gather on every subsequent tick.
  await deps.storage.setDigestState({ lastSentAtMs: deps.nowMs });
  if (text) {
    await deps.api
      .sendMessage(deps.ownerId, text)
      .catch((err) => console.error("[observability] digest DM failed:", err));
  }
}

export function startObservabilityScheduler(deps: {
  storage: Storage;
  api: NotifyApi;
  ownerId: string;
  intervalMs?: number;
}): ObservabilityScheduler {
  return startIntervalScheduler({
    intervalMs: deps.intervalMs ?? DEFAULT_INTERVAL_MS,
    logPrefix: "[observability]",
    tick: () =>
      runObservabilityTick({
        storage: deps.storage,
        api: deps.api,
        ownerId: deps.ownerId,
        nowMs: Date.now(),
      }),
  });
}
