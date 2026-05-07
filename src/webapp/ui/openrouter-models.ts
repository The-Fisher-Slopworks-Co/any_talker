/// <reference lib="dom" />

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
