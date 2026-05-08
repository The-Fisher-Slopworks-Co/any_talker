export type ProxyEndpoint = {
  provider_name: string;
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

type FrontendStats = {
  data?: Array<{
    provider_name?: string;
    pricing?: { prompt?: string; completion?: string; image?: string };
    stats?: {
      p50_throughput?: number;
      p50_latency?: number;
    } | null;
  }>;
};

export const fetchOpenRouterStats: FetchOpenRouterStats = async (
  permaslug,
) => {
  const now = Date.now();
  const cached = cache.get(permaslug);
  if (cached && now - cached.ts < TTL_MS) return cached.data;

  const url = `https://openrouter.ai/api/frontend/stats/endpoint?permaslug=${encodeURIComponent(permaslug)}`;
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`OpenRouter stats: HTTP ${res.status}`);
  const json = (await res.json()) as FrontendStats;
  const endpoints: ProxyEndpoint[] = (json.data ?? [])
    .filter((e) => typeof e.provider_name === "string")
    .map((e) => ({
      provider_name: e.provider_name as string,
      pricing: {
        prompt: e.pricing?.prompt,
        completion: e.pricing?.completion,
        image: e.pricing?.image,
      },
      throughput:
        typeof e.stats?.p50_throughput === "number"
          ? e.stats.p50_throughput
          : null,
      latency:
        typeof e.stats?.p50_latency === "number" ? e.stats.p50_latency : null,
    }));
  const data: ProxyResponse = { endpoints };
  cache.set(permaslug, { ts: now, data });
  return data;
};

const PERMASLUG_RE = /^[a-zA-Z0-9._/-]{3,200}$/;

export function isValidPermaslug(s: string): boolean {
  return PERMASLUG_RE.test(s);
}
