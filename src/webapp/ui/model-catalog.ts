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

// Pricing is USD per token; render as "$X.XX / 1M". Returns null when unpriced.
export function formatPricePerMillion(
  pricePerToken: number | undefined,
): string | null {
  if (pricePerToken === undefined || !Number.isFinite(pricePerToken)) {
    return null;
  }
  if (pricePerToken === 0) return "Free";
  const perMillion = pricePerToken * 1_000_000;
  if (perMillion >= 1) return `$${perMillion.toFixed(2)} / 1M`;
  if (perMillion >= 0.01) return `$${perMillion.toFixed(3)} / 1M`;
  return `$${perMillion.toFixed(4)} / 1M`;
}
