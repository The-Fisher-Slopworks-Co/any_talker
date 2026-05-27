// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { fetchWithTimeout } from "../ai/tools/http";

const OPENROUTER_TIMEOUT_MS = 10_000;

export type ProxyEndpoint = {
  provider_name: string;
  // Routing slug for the provider (e.g. "deepinfra/fp4"). Distinct from the
  // human-readable provider_name and what OpenRouter's provider.order expects.
  provider_slug: string | null;
  pricing: {
    prompt?: string;
    completion?: string;
    image?: string;
  };
  throughput: number | null;
  latency: number | null;
};

export type ProxyResponse = { endpoints: ProxyEndpoint[] };

export type FetchOpenRouterStats = (permaslug: string) => Promise<ProxyResponse>;

type Cached = { ts: number; data: ProxyResponse };
const TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, Cached>();

// Public, documented endpoints API. Covers every catalogue model (including
// ones the frontend stats endpoint 404s on, e.g. Anthropic) and carries the
// routing slug as `tag`, the provider name, and pricing — but no throughput or
// latency stats (those fields come back null).
type PublicEndpoints = {
  data?: {
    endpoints?: Array<{
      provider_name?: string;
      tag?: string;
      pricing?: { prompt?: string; completion?: string; image?: string };
    }>;
  };
};

// Internal frontend stats endpoint. Carries p50 throughput/latency keyed by
// provider_slug but has spotty model coverage (404s for some models), so it's
// only used to enrich the public list, never as the source of truth.
type FrontendStats = {
  data?: Array<{
    provider_slug?: string;
    stats?: {
      p50_throughput?: number;
      p50_latency?: number;
    } | null;
  }>;
};

type LatencyThroughput = { throughput: number | null; latency: number | null };

async function fetchPublicEndpoints(permaslug: string): Promise<ProxyEndpoint[]> {
  // permaslug is validated to a URL-path-safe charset, so it's interpolated
  // into the path directly — encodeURIComponent would mangle the author/slug
  // slash into %2F and break resolution.
  const url = `https://openrouter.ai/api/v1/models/${permaslug}/endpoints`;
  const res = await fetchWithTimeout(
    url,
    { headers: { accept: "application/json" } },
    OPENROUTER_TIMEOUT_MS,
    "OpenRouter endpoints",
  );
  if (!res.ok) throw new Error(`OpenRouter endpoints: HTTP ${res.status}`);
  const json = (await res.json()) as PublicEndpoints;
  return (json.data?.endpoints ?? [])
    .filter((e) => typeof e.provider_name === "string")
    .map((e) => ({
      provider_name: e.provider_name as string,
      provider_slug: typeof e.tag === "string" ? e.tag : null,
      pricing: {
        prompt: e.pricing?.prompt,
        completion: e.pricing?.completion,
        image: e.pricing?.image,
      },
      throughput: null,
      latency: null,
    }));
}

// Best-effort p50 throughput/latency by provider slug. Returns an empty map on
// any failure (e.g. the 404s this endpoint gives for some models) so a missing
// stats source degrades to "no numbers" rather than failing the whole lookup.
async function fetchSlugStats(
  permaslug: string,
): Promise<Map<string, LatencyThroughput>> {
  const out = new Map<string, LatencyThroughput>();
  try {
    const url = `https://openrouter.ai/api/frontend/stats/endpoint?permaslug=${encodeURIComponent(permaslug)}`;
    const res = await fetchWithTimeout(
      url,
      { headers: { accept: "application/json" } },
      OPENROUTER_TIMEOUT_MS,
      "OpenRouter stats",
    );
    if (!res.ok) return out;
    const json = (await res.json()) as FrontendStats;
    for (const e of json.data ?? []) {
      if (typeof e.provider_slug !== "string") continue;
      out.set(e.provider_slug, {
        throughput:
          typeof e.stats?.p50_throughput === "number"
            ? e.stats.p50_throughput
            : null,
        latency:
          typeof e.stats?.p50_latency === "number" ? e.stats.p50_latency : null,
      });
    }
  } catch {
    // Enrichment only; the public endpoints list stands on its own.
  }
  return out;
}

export const fetchOpenRouterStats: FetchOpenRouterStats = async (
  permaslug,
) => {
  const now = Date.now();
  const cached = cache.get(permaslug);
  if (cached && now - cached.ts < TTL_MS) return cached.data;

  const [endpoints, slugStats] = await Promise.all([
    fetchPublicEndpoints(permaslug),
    fetchSlugStats(permaslug),
  ]);
  const merged: ProxyEndpoint[] = endpoints.map((e) => {
    const stat = e.provider_slug ? slugStats.get(e.provider_slug) : undefined;
    return stat
      ? { ...e, throughput: stat.throughput, latency: stat.latency }
      : e;
  });
  const data: ProxyResponse = { endpoints: merged };
  cache.set(permaslug, { ts: now, data });
  return data;
};

const PERMASLUG_RE = /^[a-zA-Z0-9._/-]{3,200}$/;

export function isValidPermaslug(s: string): boolean {
  return PERMASLUG_RE.test(s);
}
