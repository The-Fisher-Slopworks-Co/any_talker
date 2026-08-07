// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

/// <reference lib="dom" />

// Per-provider endpoints for one model — which upstreams serve it, at what price
// and speed. Fetched through the bot's own server (`/api/openrouter/endpoints`),
// which owns the upstream call and its cache; the browser would hit CORS.
//
// Every failure degrades to "no data" rather than an error state: the underlying
// stats source is undocumented and 404s for some models by design.

import type { ProviderSort } from "../../shared/types";

export type ProviderEndpoint = {
  provider_name: string;
  // Routing slug (e.g. "deepinfra/fp4") used to pin routing to this provider.
  // Null for endpoints the gateway won't let us pin.
  provider_slug: string | null;
  pricing: {
    prompt?: string;
    completion?: string;
    image?: string;
  };
  throughput: number | null;
  latency: number | null;
};

export type ProviderOption = { slug: string; name: string };

const endpointCache = new Map<string, Promise<ProviderEndpoint[]>>();

function authHeader(): Record<string, string> {
  const initData = window.Telegram?.WebApp?.initData ?? "";
  return { Authorization: `tma ${initData}` };
}

export function fetchProviderEndpoints(
  modelId: string,
): Promise<ProviderEndpoint[]> {
  const cached = endpointCache.get(modelId);
  if (cached) return cached;
  const pending = (async () => {
    // The model id contains a slash the server expects verbatim, so only the
    // path is assembled here — encoding it would break resolution upstream.
    const res = await fetch(`/api/openrouter/endpoints/${modelId}`, {
      headers: authHeader(),
    });
    if (!res.ok) throw new Error(`endpoint stats: HTTP ${res.status}`);
    const json = (await res.json()) as { endpoints?: ProviderEndpoint[] };
    return json.endpoints ?? [];
  })().catch((err) => {
    endpointCache.delete(modelId);
    throw err;
  });
  endpointCache.set(modelId, pending);
  return pending;
}

// A base provider slug (the part before the first "/") routes to all of that
// provider's variants and regions, so "deepinfra/fp4" and
// "amazon-bedrock/eu-west-1" collapse to "deepinfra" / "amazon-bedrock".
function baseProviderSlug(tag: string): string {
  const slash = tag.indexOf("/");
  return slash === -1 ? tag : tag.slice(0, slash);
}

// Distinct pinnable providers for a model, keyed by base slug, preserving the
// order the gateway returned them in. Endpoints without a slug can't be pinned,
// so they're dropped.
export function toProviderOptions(
  endpoints: ProviderEndpoint[],
): ProviderOption[] {
  const seen = new Set<string>();
  const out: ProviderOption[] = [];
  for (const e of endpoints) {
    if (!e.provider_slug) continue;
    const slug = baseProviderSlug(e.provider_slug);
    if (seen.has(slug)) continue;
    seen.add(slug);
    out.push({ slug, name: e.provider_name });
  }
  return out;
}

// An unpriced endpoint sorts last rather than free — a missing number is
// unknown, and treating it as zero would make it win every price comparison.
function priceSum(e: ProviderEndpoint): number {
  const parse = (p: string | undefined): number => {
    if (p === undefined) return Infinity;
    const n = Number(p);
    return Number.isFinite(n) && n >= 0 ? n : Infinity;
  };
  return parse(e.pricing.prompt) + parse(e.pricing.completion);
}

// Which endpoint the gateway would land on for a given sort — shown in the model
// card so the admin sees the consequence of the setting. Returns null when
// nothing carries the metric, so the UI can say "unknown" instead of guessing.
export function pickEndpointBySort(
  endpoints: ProviderEndpoint[],
  sort: ProviderSort,
): ProviderEndpoint | null {
  if (endpoints.length === 0) return null;
  if (sort === "price") {
    const best = endpoints.reduce((a, e) => (priceSum(e) < priceSum(a) ? e : a));
    return priceSum(best) === Infinity ? null : best;
  }
  if (sort === "throughput") {
    const candidates = endpoints.filter((e) => e.throughput !== null);
    if (candidates.length === 0) return null;
    return candidates.reduce((a, e) =>
      (e.throughput ?? 0) > (a.throughput ?? 0) ? e : a,
    );
  }
  const candidates = endpoints.filter((e) => e.latency !== null);
  if (candidates.length === 0) return null;
  return candidates.reduce((a, e) =>
    (e.latency ?? Infinity) < (a.latency ?? Infinity) ? e : a,
  );
}
