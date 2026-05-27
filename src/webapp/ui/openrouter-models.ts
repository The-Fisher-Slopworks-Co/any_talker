// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

/// <reference lib="dom" />

import type { ProviderSort } from "../../shared/types";

export type OpenRouterModel = {
  id: string;
  name: string;
  pricing: {
    prompt?: string;
    completion?: string;
    image?: string;
    input_cache_read?: string;
    input_cache_write?: string;
  };
  architecture?: {
    input_modalities?: string[];
  };
  supported_parameters?: string[];
};

export type OpenRouterEndpoint = {
  provider_name: string;
  // Routing slug (e.g. "deepinfra/fp4") used to pin OpenRouter to this
  // provider. May be null for older cached responses; such endpoints can't be
  // pinned. Optional on the type so existing fixtures keep typechecking.
  provider_slug?: string | null;
  pricing: {
    prompt?: string;
    completion?: string;
    image?: string;
  };
  throughput: number | null;
  latency: number | null;
};

let cache: Promise<Map<string, OpenRouterModel>> | null = null;

export function fetchOpenRouterModels(): Promise<Map<string, OpenRouterModel>> {
  if (cache) return cache;
  cache = (async () => {
    const res = await fetch("https://openrouter.ai/api/v1/models");
    if (!res.ok) throw new Error(`OpenRouter /models: HTTP ${res.status}`);
    const json = (await res.json()) as { data: OpenRouterModel[] };
    const map = new Map<string, OpenRouterModel>();
    for (const m of json.data) map.set(m.id, m);
    return map;
  })().catch((err) => {
    cache = null;
    throw err;
  });
  return cache;
}

const endpointCache = new Map<string, Promise<OpenRouterEndpoint[]>>();

function authHeader(): Record<string, string> {
  const initData = window.Telegram?.WebApp?.initData ?? "";
  return { Authorization: `tma ${initData}` };
}

export function fetchOpenRouterEndpoints(
  modelId: string,
): Promise<OpenRouterEndpoint[]> {
  const cached = endpointCache.get(modelId);
  if (cached) return cached;
  const p = (async () => {
    const res = await fetch(
      `/api/openrouter/endpoints/${encodeURIComponent(modelId)}`,
      { headers: authHeader() },
    );
    if (!res.ok) throw new Error(`OpenRouter endpoints: HTTP ${res.status}`);
    const json = (await res.json()) as { endpoints?: OpenRouterEndpoint[] };
    return json.endpoints ?? [];
  })().catch((err) => {
    endpointCache.delete(modelId);
    throw err;
  });
  endpointCache.set(modelId, p);
  return p;
}


function priceSum(e: OpenRouterEndpoint): number {
  // Treat any non-finite or negative price as "missing": never rank such
  // endpoints best by price. Falls back to Infinity so a sort by price
  // pushes them to the end.
  const parse = (p: string | undefined): number => {
    if (p === undefined) return Infinity;
    const n = Number(p);
    return Number.isFinite(n) && n >= 0 ? n : Infinity;
  };
  return parse(e.pricing.prompt) + parse(e.pricing.completion);
}

export type ProviderOption = { slug: string; name: string };

// Distinct routable providers for a model, keyed by slug, preserving the order
// OpenRouter returned them in. Endpoints without a slug can't be pinned, so
// they're dropped.
export function toProviderOptions(
  endpoints: OpenRouterEndpoint[],
): ProviderOption[] {
  const seen = new Set<string>();
  const out: ProviderOption[] = [];
  for (const e of endpoints) {
    const slug = e.provider_slug;
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    out.push({ slug, name: e.provider_name });
  }
  return out;
}

export function pickEndpointBySort(
  endpoints: OpenRouterEndpoint[],
  sort: ProviderSort,
): OpenRouterEndpoint | null {
  if (endpoints.length === 0) return null;
  if (sort === "price") {
    return endpoints.reduce((best, e) =>
      priceSum(e) < priceSum(best) ? e : best,
    );
  }
  if (sort === "throughput") {
    const candidates = endpoints.filter(
      (e) => e.throughput !== null && e.throughput !== undefined,
    );
    if (candidates.length === 0) return null;
    return candidates.reduce((best, e) =>
      (e.throughput ?? 0) > (best.throughput ?? 0) ? e : best,
    );
  }
  // sort === "latency"
  const candidates = endpoints.filter(
    (e) => e.latency !== null && e.latency !== undefined,
  );
  if (candidates.length === 0) return null;
  return candidates.reduce((best, e) =>
    (e.latency ?? Infinity) < (best.latency ?? Infinity) ? e : best,
  );
}

// OpenRouter accepts routing suffixes like `:nitro`, `:floor`, `:online`, `:auto`
// that don't appear as their own entries in /models — they resolve to a base
// model server-side. Some suffixes (e.g. `:free`) ARE real catalog entries, so
// try the exact ID first before falling back to the part before the colon.
export function lookupOpenRouterModel(
  catalog: Map<string, OpenRouterModel>,
  id: string,
): OpenRouterModel | null {
  const exact = catalog.get(id);
  if (exact) return exact;
  const colon = id.lastIndexOf(":");
  if (colon <= 0) return null;
  return catalog.get(id.slice(0, colon)) ?? null;
}

export function supportsTools(m: OpenRouterModel): boolean {
  return (m.supported_parameters ?? []).includes("tools");
}

export function supportsCaching(m: OpenRouterModel): boolean {
  return (
    m.pricing.input_cache_read !== undefined ||
    m.pricing.input_cache_write !== undefined
  );
}

// Pricing in OpenRouter is dollars per token. Render as "$X.XX / 1M tok".
export function formatPricePerMillion(price: string | undefined): string | null {
  if (price === undefined) return null;
  const n = Number(price);
  if (!Number.isFinite(n)) return null;
  if (n === 0) return "Free";
  const perMillion = n * 1_000_000;
  if (perMillion >= 1) return `$${perMillion.toFixed(2)} / 1M`;
  if (perMillion >= 0.01) return `$${perMillion.toFixed(3)} / 1M`;
  return `$${perMillion.toFixed(4)} / 1M`;
}
