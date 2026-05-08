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
  pricing: {
    prompt?: string;
    completion?: string;
    image?: string;
  };
  latency_last_30m: number | null;
  throughput_last_30m: number | null;
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

export function fetchOpenRouterEndpoints(
  modelId: string,
): Promise<OpenRouterEndpoint[]> {
  const cached = endpointCache.get(modelId);
  if (cached) return cached;
  const p = (async () => {
    const res = await fetch(
      `https://openrouter.ai/api/v1/models/${modelId}/endpoints`,
    );
    if (!res.ok) throw new Error(`OpenRouter endpoints: HTTP ${res.status}`);
    const json = (await res.json()) as {
      data?: { endpoints?: OpenRouterEndpoint[] };
    };
    return json.data?.endpoints ?? [];
  })().catch((err) => {
    endpointCache.delete(modelId);
    throw err;
  });
  endpointCache.set(modelId, p);
  return p;
}

function priceSum(e: OpenRouterEndpoint): number {
  const parse = (p: string | undefined): number => {
    if (p === undefined) return Infinity;
    const n = Number(p);
    return Number.isFinite(n) ? n : Infinity;
  };
  return parse(e.pricing.prompt) + parse(e.pricing.completion);
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
      (e) => e.throughput_last_30m !== null && e.throughput_last_30m !== undefined,
    );
    if (candidates.length === 0) return null;
    return candidates.reduce((best, e) =>
      (e.throughput_last_30m ?? 0) > (best.throughput_last_30m ?? 0) ? e : best,
    );
  }
  // sort === "latency"
  const candidates = endpoints.filter(
    (e) => e.latency_last_30m !== null && e.latency_last_30m !== undefined,
  );
  if (candidates.length === 0) return null;
  return candidates.reduce((best, e) =>
    (e.latency_last_30m ?? Infinity) < (best.latency_last_30m ?? Infinity)
      ? e
      : best,
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
