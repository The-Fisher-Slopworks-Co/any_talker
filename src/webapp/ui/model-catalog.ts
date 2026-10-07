// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

/// <reference lib="dom" />

import type { ModelInfo } from "../../ai/model-catalog";
import { resolveModelId } from "../../ai/model-id";

export type { ModelInfo };

// Promise-singleton catalogue fetch; clears on error so a later open retries.
// The catalogue is proxied through the bot's own `/api/models` (the configured
// endpoint needs an API key and may not be CORS-open), so this call is
// authenticated with the Telegram initData like every other Mini App request.
let cache: Promise<Map<string, ModelInfo>> | null = null;
// The same catalogue once it has arrived, so a screen opened later can start
// from it instead of a loading frame.
let loaded: Map<string, ModelInfo> | null = null;

export function loadedModelCatalog(): Map<string, ModelInfo> | null {
  return loaded;
}

function authHeader(): Record<string, string> {
  const initData = window.Telegram?.WebApp?.initData ?? "";
  return { Authorization: `tma ${initData}` };
}

export function fetchModelCatalog(): Promise<Map<string, ModelInfo>> {
  if (cache) return cache;
  cache = (async () => {
    const res = await fetch("/api/models", { headers: authHeader() });
    if (!res.ok) throw new Error(`/api/models: HTTP ${res.status}`);
    const json = (await res.json()) as { models?: ModelInfo[] };
    const map = new Map<string, ModelInfo>();
    for (const m of json.models ?? []) map.set(m.id, m);
    loaded = map;
    return map;
  })().catch((err) => {
    cache = null;
    throw err;
  });
  return cache;
}

export function lookupModel(
  catalog: Map<string, ModelInfo>,
  id: string,
): ModelInfo | null {
  return resolveModelId(catalog, id);
}

export function supportsTools(m: ModelInfo): boolean {
  return m.capabilities?.tools === true;
}

// Undefined when the catalogue gave no basis to judge, so the caller can omit
// the row instead of rendering an unfounded "No".
export function supportsCaching(m: ModelInfo): boolean | undefined {
  return m.capabilities?.caching;
}

// Pricing is USD per token; render as "$3/M". Returns null when unpriced.
export function formatPricePerMillion(
  pricePerToken: number | undefined,
): string | null {
  if (pricePerToken === undefined || !Number.isFinite(pricePerToken)) {
    return null;
  }
  if (pricePerToken === 0) return "Free";
  const perMillion = pricePerToken * 1_000_000;
  // Cents for dollars, more places the cheaper it gets; no trailing zeros.
  const places = perMillion >= 1 ? 2 : perMillion >= 0.01 ? 3 : 4;
  return `$${Number(perMillion.toFixed(places))}/M`;
}
