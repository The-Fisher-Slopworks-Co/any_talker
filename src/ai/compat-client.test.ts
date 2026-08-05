// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import {
  buildAttributionHeaders,
  buildProviderOptions,
  buildProviderRouting,
  computeCostUsd,
  OpenAICompatClient,
  resolveAskCost,
} from "./compat-client";
import { capabilitiesFor } from "./provider-profile";
import type { PriceLookup, ModelPricing } from "./model-catalog";

const lookup = (pricing: ModelPricing | null): PriceLookup => ({
  getPricing: () => pricing,
});

const OPENROUTER = capabilitiesFor("openrouter");
const GENERIC = capabilitiesFor("generic");

// One `generateText` step, reduced to the only field the cost reader looks at.
const step = (body: unknown) => ({ response: { body } });
const costStep = (cost: unknown) => step({ usage: { cost } });

describe("computeCostUsd", () => {
  test("inputTokens × promptPrice + outputTokens × completionPrice", () => {
    const pricing = { promptPerToken: 0.000001, completionPerToken: 0.000002 };
    // 1000 × 1e-6 + 500 × 2e-6 = 0.001 + 0.001 = 0.002
    expect(computeCostUsd(lookup(pricing), "m", 1000, 500)).toBeCloseTo(0.002, 9);
  });

  test("returns 0 when the model has no pricing", () => {
    expect(computeCostUsd(lookup(null), "unpriced", 1000, 500)).toBe(0);
  });

  test("returns 0 for zero token usage even when priced", () => {
    const pricing = { promptPerToken: 0.000001, completionPerToken: 0.000002 };
    expect(computeCostUsd(lookup(pricing), "m", 0, 0)).toBe(0);
  });
});

describe("buildProviderRouting", () => {
  test("a pinned provider wins over a sort and disables fallbacks", () => {
    expect(buildProviderRouting("deepinfra", "price")).toEqual({
      order: ["deepinfra"],
      allow_fallbacks: false,
    });
  });

  test("a sort alone becomes a sort directive", () => {
    expect(buildProviderRouting(null, "throughput")).toEqual({
      sort: "throughput",
    });
  });

  test("neither set leaves routing to the gateway", () => {
    expect(buildProviderRouting(null, null)).toBeUndefined();
    expect(buildProviderRouting(undefined, undefined)).toBeUndefined();
  });
});

describe("buildProviderOptions", () => {
  // The gate is load-bearing: OpenAI answers HTTP 400 to an unknown body field,
  // so a generic endpoint must receive nothing but the standard surface.
  test("sends no proprietary field to a generic endpoint", () => {
    const opts = buildProviderOptions(GENERIC, {
      fallbackModels: ["b", "c"],
      routing: { providerSort: "price", provider: "deepinfra", serviceTier: "flex" },
      reasoningEffort: "high",
    });
    expect(opts).toEqual({ reasoningEffort: "high" });
  });

  test("a generic endpoint with nothing to send yields no options at all", () => {
    expect(
      buildProviderOptions(GENERIC, { fallbackModels: [], routing: {} }),
    ).toBeUndefined();
  });

  test("OpenRouter gets the fallback chain, routing, tier and usage accounting", () => {
    const opts = buildProviderOptions(OPENROUTER, {
      fallbackModels: ["b", "c"],
      routing: { providerSort: "price", provider: null, serviceTier: "flex" },
      reasoningEffort: "low",
    });
    expect(opts).toEqual({
      models: ["b", "c"],
      provider: { sort: "price" },
      service_tier: "flex",
      usage: { include: true },
      reasoning: { effort: "low" },
    });
  });

  test("omits the fallback chain when there is nothing to fall back to", () => {
    const opts = buildProviderOptions(OPENROUTER, {
      fallbackModels: [],
      routing: {},
    });
    expect(opts).toEqual({ usage: { include: true } });
  });

  // OpenRouter's unified reasoning object vs the flat OpenAI field: sending both
  // would be two spellings of one setting in a single body.
  test("picks exactly one reasoning spelling per flavor", () => {
    const or = buildProviderOptions(OPENROUTER, {
      fallbackModels: [],
      routing: {},
      reasoningEffort: "high",
    });
    expect(or).toHaveProperty("reasoning", { effort: "high" });
    expect(or).not.toHaveProperty("reasoningEffort");

    const generic = buildProviderOptions(GENERIC, {
      fallbackModels: [],
      routing: {},
      reasoningEffort: "high",
    });
    expect(generic).toHaveProperty("reasoningEffort", "high");
    expect(generic).not.toHaveProperty("reasoning");
  });

  test("omits reasoning entirely when no effort is requested", () => {
    const opts = buildProviderOptions(OPENROUTER, {
      fallbackModels: [],
      routing: {},
      reasoningEffort: null,
    });
    expect(opts).not.toHaveProperty("reasoning");
    expect(opts).not.toHaveProperty("reasoningEffort");
  });
});

describe("resolveAskCost", () => {
  const priced = { promptPerToken: 0.000001, completionPerToken: 0.000002 };

  test("sums the cost the gateway reported across tool-call steps", () => {
    const r = resolveAskCost({
      caps: OPENROUTER,
      pricing: lookup(priced),
      modelId: "m",
      steps: [costStep(0.001), costStep(0.002)],
      inputTokens: 1000,
      outputTokens: 500,
    });
    expect(r.costUsd).toBeCloseTo(0.003, 9);
    expect(r.priced).toBe(true);
  });

  // A free model reports a real zero. That is not the same as reporting nothing,
  // and must not silently fall back to the local price list.
  test("treats a reported zero as a real cost", () => {
    const r = resolveAskCost({
      caps: OPENROUTER,
      pricing: lookup(priced),
      modelId: "m",
      steps: [costStep(0)],
      inputTokens: 1000,
      outputTokens: 500,
    });
    expect(r.costUsd).toBe(0);
    expect(r.priced).toBe(true);
  });

  test("falls back to the local price list when no step reported a cost", () => {
    const r = resolveAskCost({
      caps: OPENROUTER,
      pricing: lookup(priced),
      modelId: "m",
      steps: [step({ usage: { total_tokens: 1500 } })],
      inputTokens: 1000,
      outputTokens: 500,
    });
    expect(r.costUsd).toBeCloseTo(0.002, 9);
    expect(r.priced).toBe(true);
  });

  test("ignores a non-numeric or non-finite reported cost", () => {
    for (const bad of ["0.01", NaN, Infinity, null, {}]) {
      const r = resolveAskCost({
        caps: OPENROUTER,
        pricing: lookup(null),
        modelId: "m",
        steps: [costStep(bad)],
        inputTokens: 1000,
        outputTokens: 500,
      });
      expect(r.costUsd).toBe(0);
      expect(r.priced).toBe(false);
    }
  });

  test("survives a step with no response body", () => {
    const r = resolveAskCost({
      caps: OPENROUTER,
      pricing: lookup(priced),
      modelId: "m",
      steps: [{}, step(undefined), costStep(0.005)],
      inputTokens: 0,
      outputTokens: 0,
    });
    expect(r.costUsd).toBeCloseTo(0.005, 9);
    expect(r.priced).toBe(true);
  });

  test("a generic endpoint always prices locally", () => {
    const r = resolveAskCost({
      caps: GENERIC,
      pricing: lookup(priced),
      modelId: "m",
      // Even if a body happened to carry a cost, an endpoint whose profile does
      // not promise usage accounting is not trusted for money.
      steps: [costStep(9.99)],
      inputTokens: 1000,
      outputTokens: 500,
    });
    expect(r.costUsd).toBeCloseTo(0.002, 9);
    expect(r.priced).toBe(true);
  });

  test("an unpriced model on a generic endpoint is flagged as under-counted", () => {
    const r = resolveAskCost({
      caps: GENERIC,
      pricing: lookup(null),
      modelId: "m",
      steps: [],
      inputTokens: 1000,
      outputTokens: 500,
    });
    expect(r.costUsd).toBe(0);
    expect(r.priced).toBe(false);
  });
});

// These exercise the real provider package, not our own helpers: the whole
// capability gate rests on @ai-sdk/openai-compatible spreading unknown
// `providerOptions` keys into the request body verbatim and mapping the ones its
// own schema knows. If that contract ever changes, the fields silently stop
// being sent (or start being rejected) — so it is pinned here rather than
// assumed.
describe("OpenAICompatClient — the body that actually goes out", () => {
  // Minimal non-streaming chat-completions response the SDK will accept.
  const reply = (extra: Record<string, unknown> = {}) =>
    JSON.stringify({
      id: "1",
      object: "chat.completion",
      created: 0,
      model: "m",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: "hi" },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15, ...extra },
    });

  async function capture(opts: {
    capabilities: Parameters<typeof buildProviderOptions>[0];
    models: string[];
    routing?: Parameters<typeof buildProviderOptions>[1]["routing"];
    usage?: Record<string, unknown>;
  }) {
    let body: Record<string, unknown> = {};
    let headers: Record<string, string> = {};
    const client = new OpenAICompatClient({
      baseURL: "https://gateway.test/v1",
      apiKey: "k",
      pricing: lookup({ promptPerToken: 0.000001, completionPerToken: 0.000002 }),
      capabilities: opts.capabilities,
      attribution: { url: "https://example.com", title: "any_talker" },
      fetch: (async (_url: unknown, init: RequestInit) => {
        body = JSON.parse(String(init.body));
        headers = (init.headers ?? {}) as Record<string, string>;
        return new Response(reply(opts.usage), {
          headers: { "content-type": "application/json" },
        });
      }) as typeof globalThis.fetch,
    });
    const result = await client.ask({
      models: opts.models,
      system: "sys",
      messages: [{ role: "user", content: "hi" }],
      tools: [],
      routing: opts.routing,
      reasoningEffort: "high",
      toolCallContext: {} as never,
    });
    return { body, headers, result };
  }

  test("a generic endpoint receives the standard surface and nothing else", async () => {
    const { body } = await capture({
      capabilities: GENERIC,
      models: ["gpt-4o", "gpt-4o-mini"],
      routing: { providerSort: "price", provider: "deepinfra", serviceTier: "flex" },
    });
    expect(body.model).toBe("gpt-4o");
    expect(body.reasoning_effort).toBe("high");
    // The whole request would 400 on any of these.
    for (const key of ["models", "provider", "service_tier", "usage", "reasoning"]) {
      expect(body).not.toHaveProperty(key);
    }
  });

  test("OpenRouter receives the fallback chain, routing, tier and usage flag", async () => {
    const { body } = await capture({
      capabilities: OPENROUTER,
      models: ["a/primary", "b/backup"],
      routing: { providerSort: "price", provider: null, serviceTier: "flex" },
    });
    expect(body.model).toBe("a/primary");
    expect(body.models).toEqual(["b/backup"]);
    expect(body.provider).toEqual({ sort: "price" });
    expect(body.service_tier).toBe("flex");
    expect(body.usage).toEqual({ include: true });
    expect(body.reasoning).toEqual({ effort: "high" });
    expect(body).not.toHaveProperty("reasoning_effort");
  });

  test("attribution travels as request headers", async () => {
    const { headers } = await capture({
      capabilities: OPENROUTER,
      models: ["a/primary"],
    });
    // The SDK lower-cases header names on the way out; HTTP treats them
    // case-insensitively, so match how they actually appear on the wire.
    const lower = Object.fromEntries(
      Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]),
    );
    expect(lower["http-referer"]).toBe("https://example.com");
    expect(lower["x-title"]).toBe("any_talker");
  });

  test("a reported usage.cost is read back off the wire", async () => {
    const { result } = await capture({
      capabilities: OPENROUTER,
      models: ["a/primary"],
      usage: { cost: 0.0123 },
    });
    expect(result.costUsd).toBeCloseTo(0.0123, 9);
    expect(result.priced).toBe(true);
  });

  test("without usage accounting the cost is priced from the catalogue", async () => {
    const { result } = await capture({
      capabilities: GENERIC,
      models: ["gpt-4o"],
      usage: { cost: 9.99 },
    });
    // 10 × 1e-6 + 5 × 2e-6 = 2e-5
    expect(result.costUsd).toBeCloseTo(0.00002, 9);
  });
});

describe("buildAttributionHeaders", () => {
  test("emits both attribution headers when configured", () => {
    expect(
      buildAttributionHeaders({ url: "https://example.com", title: "any_talker" }),
    ).toEqual({
      "HTTP-Referer": "https://example.com",
      "X-Title": "any_talker",
    });
  });

  test("omits what isn't configured", () => {
    expect(buildAttributionHeaders({ title: "only" })).toEqual({
      "X-Title": "only",
    });
    expect(buildAttributionHeaders({})).toEqual({});
  });
});
