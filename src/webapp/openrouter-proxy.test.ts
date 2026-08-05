// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe, afterEach } from "bun:test";
import {
  fetchOpenRouterEndpoints,
  isValidPermaslug,
  _resetEndpointCacheForTest,
} from "./openrouter-proxy";

afterEach(() => _resetEndpointCacheForTest());

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

// Routes by URL so one stub can answer both upstreams the proxy merges.
const stub =
  (handlers: { endpoints?: () => Response; stats?: () => Response }) =>
  async (url: string) =>
    url.includes("/frontend/stats/")
      ? (handlers.stats?.() ?? json({ data: [] }))
      : (handlers.endpoints?.() ?? json({ data: { endpoints: [] } }));

describe("fetchOpenRouterEndpoints", () => {
  test("maps the provider list and merges p50 stats by slug", async () => {
    const r = await fetchOpenRouterEndpoints("a/model-1", {
      fetch: stub({
        endpoints: () =>
          json({
            data: {
              endpoints: [
                {
                  provider_name: "DeepInfra",
                  tag: "deepinfra/fp4",
                  pricing: { prompt: "0.000001", completion: "0.000002" },
                },
              ],
            },
          }),
        stats: () =>
          json({
            data: [
              {
                provider_slug: "deepinfra/fp4",
                stats: { p50_throughput: 120, p50_latency: 300 },
              },
            ],
          }),
      }),
    });
    expect(r.endpoints).toEqual([
      {
        provider_name: "DeepInfra",
        provider_slug: "deepinfra/fp4",
        pricing: { prompt: "0.000001", completion: "0.000002", image: undefined },
        throughput: 120,
        latency: 300,
      },
    ]);
  });

  // A model id the endpoints API doesn't list — a bare slug missing its author
  // prefix, or a model with no public listing — is a normal "nothing to show",
  // not a server fault. It must not surface as a 502 with a stack trace.
  test("treats an upstream 404 as an empty provider list", async () => {
    const r = await fetchOpenRouterEndpoints("a/model-2", {
      fetch: stub({ endpoints: () => json({ error: "not found" }, 404) }),
    });
    expect(r.endpoints).toEqual([]);
  });

  test("still throws on a genuine upstream failure", async () => {
    await expect(
      fetchOpenRouterEndpoints("a/model-3", {
        fetch: stub({ endpoints: () => json({ error: "boom" }, 500) }),
      }),
    ).rejects.toThrow(/500/);
  });

  test("a failing stats call leaves the provider list intact", async () => {
    const r = await fetchOpenRouterEndpoints("a/model-4", {
      fetch: stub({
        endpoints: () =>
          json({
            data: { endpoints: [{ provider_name: "Together", tag: "together" }] },
          }),
        stats: () => json({ error: "nope" }, 500),
      }),
    });
    expect(r.endpoints).toHaveLength(1);
    expect(r.endpoints[0]?.throughput).toBeNull();
    expect(r.endpoints[0]?.latency).toBeNull();
  });

  test("caches per model so reopening the picker doesn't refetch", async () => {
    let calls = 0;
    const counting = async (url: string) => {
      calls++;
      return url.includes("/frontend/stats/")
        ? json({ data: [] })
        : json({ data: { endpoints: [] } });
    };
    await fetchOpenRouterEndpoints("a/model-5", { fetch: counting });
    const after = calls;
    await fetchOpenRouterEndpoints("a/model-5", { fetch: counting });
    expect(calls).toBe(after);
  });
});

describe("isValidPermaslug", () => {
  test("accepts an author/slug id and its variants", () => {
    for (const s of [
      "anthropic/claude-sonnet-5",
      "google/gemini-2.5-flash",
      "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free".replace(":free", ""),
    ]) {
      expect(isValidPermaslug(s)).toBe(true);
    }
  });

  test("rejects path escapes and out-of-charset ids", () => {
    for (const s of ["../secrets", "a/../b", "a b", "a?b=1", "a#b", "x"]) {
      expect(isValidPermaslug(s)).toBe(false);
    }
  });
});
