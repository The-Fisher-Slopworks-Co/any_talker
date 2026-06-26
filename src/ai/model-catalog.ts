// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

// Server-side model catalogue + pricing for the configured OpenAI-compatible
// endpoint. Fetches `GET {baseURL}/models` and caches it (TTL), then serves two
// consumers from one object:
//   - the admin Mini App model picker, via the `/api/models` route, and
//   - per-request USD cost computation in the AI client, via `PriceLookup`.
//
// A bare OpenAI `/v1/models` response is a flat id list with no pricing; richer
// gateways (LiteLLM, OpenRouter-style) add per-token pricing and capability
// metadata. Parsing tolerates both shapes: pricing/capabilities surface only
// when present, and cost computation degrades to 0 when pricing is absent.

import { resolveModelId } from "./model-id";

const DEFAULT_TTL_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 10_000;

// Minimal fetch signature so an injected proxied fetch or a test stub satisfies
// it without carrying the full `typeof fetch` (Bun's `preconnect` etc.).
type FetchLike = (
  url: string,
  init?: { headers?: Record<string, string>; signal?: AbortSignal },
) => Promise<Response>;

// Per-token price in USD, as read from the catalogue.
export type ModelPricing = {
  promptPerToken: number;
  completionPerToken: number;
};

// The narrow capability the AI client needs: look up a model's price. Keeping
// this a separate port decouples the client from how the catalogue is
// fetched/cached and makes cost logic trivial to unit-test.
export interface PriceLookup {
  getPricing(modelId: string): ModelPricing | null;
}

// A normalized catalogue entry surfaced to the Mini App. Everything but `id` is
// optional because a bare OpenAI endpoint omits pricing and capabilities.
export type ModelInfo = {
  id: string;
  name?: string;
  pricing?: {
    promptPerToken: number;
    completionPerToken: number;
    imagePerToken?: number;
  };
  capabilities?: {
    // Input modalities the model accepts, e.g. ["text", "image", "audio"].
    modalities?: string[];
    tools?: boolean;
  };
};

export interface ModelCatalog extends PriceLookup {
  // Full catalogue for the `/api/models` route; refreshes if the cache is stale.
  list(): Promise<ModelInfo[]>;
  // Force a refresh (used at boot to warm the cache + pricing map).
  refresh(): Promise<void>;
  // Returns the subset of `modelIds` the catalogue does not know (resolving
  // ":variant" suffixes like the pricing lookup). Returns [] — i.e. "all
  // allowed" — when the catalogue is empty or unavailable, so callers degrade
  // gracefully and never block a save just because no list could be fetched.
  unknownModels(modelIds: string[]): Promise<string[]>;
}

export function createModelCatalog(opts: {
  baseURL: string;
  apiKey: string;
  fetch?: FetchLike;
  ttlMs?: number;
}): ModelCatalog {
  const doFetch = opts.fetch ?? globalThis.fetch;
  const ttlMs = opts.ttlMs ?? DEFAULT_TTL_MS;
  // `baseURL` already includes the API version segment (e.g. ".../v1"); append
  // the models path, tolerating a trailing slash either way.
  const url = `${opts.baseURL.replace(/\/+$/, "")}/models`;

  let entries: ModelInfo[] = [];
  let entryMap = new Map<string, ModelInfo>();
  let priceMap = new Map<string, ModelPricing>();
  let fetchedAtMs = 0;
  let inflight: Promise<void> | null = null;

  async function doRefresh(): Promise<void> {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await doFetch(url, {
        headers: {
          accept: "application/json",
          authorization: `Bearer ${opts.apiKey}`,
        },
        signal: ac.signal,
      });
      if (!res.ok) throw new Error(`model catalogue: HTTP ${res.status}`);
      const json = (await res.json()) as { data?: unknown };
      const raw = Array.isArray(json.data) ? json.data : [];
      const parsed: ModelInfo[] = [];
      const ids = new Map<string, ModelInfo>();
      const prices = new Map<string, ModelPricing>();
      for (const item of raw) {
        const info = parseModelEntry(item);
        if (!info) continue;
        parsed.push(info);
        ids.set(info.id, info);
        if (info.pricing) {
          prices.set(info.id, {
            promptPerToken: info.pricing.promptPerToken,
            completionPerToken: info.pricing.completionPerToken,
          });
        }
      }
      entries = parsed;
      entryMap = ids;
      priceMap = prices;
      fetchedAtMs = Date.now();
    } finally {
      clearTimeout(timer);
    }
  }

  function refresh(): Promise<void> {
    // De-dupe concurrent refreshes (boot warm-up racing the first /api/models).
    if (inflight) return inflight;
    inflight = doRefresh().finally(() => {
      inflight = null;
    });
    return inflight;
  }

  async function ensureFresh(): Promise<void> {
    if (fetchedAtMs > 0 && Date.now() - fetchedAtMs < ttlMs) return;
    try {
      await refresh();
    } catch {
      // Keep serving the last good (or empty) catalogue on failure rather than
      // throwing; the picker shows whatever was cached and pricing degrades.
    }
  }

  return {
    async list() {
      await ensureFresh();
      return entries;
    },
    async refresh() {
      await refresh();
    },
    async unknownModels(modelIds: string[]): Promise<string[]> {
      await ensureFresh();
      // No catalogue to validate against → treat everything as allowed.
      if (entryMap.size === 0) return [];
      return modelIds.filter(
        (id) => resolveModelId(entryMap, id.trim()) === null,
      );
    },
    getPricing(modelId: string): ModelPricing | null {
      return resolveModelId(priceMap, modelId);
    },
  };
}

// Parses one raw `/models` entry into a `ModelInfo`, or null if it has no usable
// id. Exported for unit tests covering the bare and richer response shapes.
export function parseModelEntry(raw: unknown): ModelInfo | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string" || r.id.length === 0) return null;

  const info: ModelInfo = { id: r.id };
  if (typeof r.name === "string" && r.name.length > 0) info.name = r.name;

  const pricing = parsePricing(r.pricing);
  if (pricing) info.pricing = pricing;

  const capabilities = parseCapabilities(r);
  if (capabilities) info.capabilities = capabilities;

  return info;
}

function parseTokenPrice(v: unknown): number | null {
  if (typeof v !== "string" && typeof v !== "number") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function parsePricing(raw: unknown): ModelInfo["pricing"] | null {
  if (typeof raw !== "object" || raw === null) return null;
  const p = raw as Record<string, unknown>;
  const prompt = parseTokenPrice(p.prompt);
  const completion = parseTokenPrice(p.completion);
  // Both halves are required to compute a meaningful per-request cost.
  if (prompt === null || completion === null) return null;
  const pricing: NonNullable<ModelInfo["pricing"]> = {
    promptPerToken: prompt,
    completionPerToken: completion,
  };
  const image = parseTokenPrice(p.image);
  if (image !== null) pricing.imagePerToken = image;
  return pricing;
}

function parseCapabilities(
  r: Record<string, unknown>,
): ModelInfo["capabilities"] | null {
  const arch = r.architecture as { input_modalities?: unknown } | undefined;
  const modalities = Array.isArray(arch?.input_modalities)
    ? (arch.input_modalities as unknown[]).filter(
        (m): m is string => typeof m === "string",
      )
    : null;
  const supported = Array.isArray(r.supported_parameters)
    ? (r.supported_parameters as unknown[]).filter(
        (s): s is string => typeof s === "string",
      )
    : null;
  if (!modalities && !supported) return null;
  const capabilities: NonNullable<ModelInfo["capabilities"]> = {};
  if (modalities) capabilities.modalities = modalities;
  if (supported) capabilities.tools = supported.includes("tools");
  return capabilities;
}
