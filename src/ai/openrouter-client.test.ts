// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { z } from "zod";
// The SDK fills `httpReferer`/`appTitle`/`appCategories` from `OPENROUTER_*`
// env vars when the caller leaves them unset (`fillGlobals`,
// `sdk/esm/lib/env.js:51-64`), and `apiKey` the same way one layer down
// (`sdk/esm/lib/security.js:128`). Bun loads `.env` automatically — so on a
// developer machine the attribution assertions below would read the operator's
// real config instead of what this suite configured. `resetEnv` is the SDK's
// own documented testing seam for that.
import { resetEnv } from "@openrouter/sdk/lib/env.js";
import {
  buildProviderRouting,
  buildRequestFields,
  MAX_SESSION_ID_LENGTH,
  MAX_TOOL_ROUNDS,
  OpenRouterClient,
  resolveAskCost,
} from "./openrouter-client";
import type { AIMessage } from "./types";
import type { Tool, ToolCallContext } from "./tools/registry";
import { aiRequestsTotal } from "../metrics";

const SDK_ENV_VARS = [
  "OPENROUTER_API_KEY",
  "OPENROUTER_HTTP_REFERER",
  "OPENROUTER_APP_TITLE",
  "OPENROUTER_APP_CATEGORIES",
] as const;
const savedEnv = new Map<string, string | undefined>();

beforeAll(() => {
  for (const name of SDK_ENV_VARS) {
    savedEnv.set(name, process.env[name]);
    delete process.env[name];
  }
  resetEnv();
});

afterAll(() => {
  for (const [name, value] of savedEnv) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  resetEnv();
});

describe("buildProviderRouting", () => {
  test("a pinned provider wins over a sort and disables fallbacks", () => {
    expect(buildProviderRouting("deepinfra", "price")).toEqual({
      order: ["deepinfra"],
      allowFallbacks: false,
    });
  });

  test("a sort alone becomes a sort directive", () => {
    expect(buildProviderRouting(null, "throughput")).toEqual({
      sort: "throughput",
    });
  });

  test("neither set leaves routing to OpenRouter", () => {
    expect(buildProviderRouting(null, null)).toBeUndefined();
    expect(buildProviderRouting(undefined, undefined)).toBeUndefined();
  });
});

describe("buildRequestFields", () => {
  test("splits the chain into the primary and the fallback tail", () => {
    const f = buildRequestFields({
      models: ["a/primary", "b/backup", "c/last"],
      routing: {},
    });
    expect(f.model).toBe("a/primary");
    expect(f.models).toEqual(["b/backup", "c/last"]);
  });

  test("omits the fallback chain when there is nothing to fall back to", () => {
    const f = buildRequestFields({ models: ["a/primary"], routing: {} });
    expect(f).not.toHaveProperty("models");
  });

  test("carries routing, tier, session and reasoning", () => {
    expect(
      buildRequestFields({
        models: ["a/primary"],
        routing: { provider: null, providerSort: "price", serviceTier: "flex" },
        reasoningEffort: "low",
        sessionId: "tg:main:-100123",
      }),
    ).toEqual({
      model: "a/primary",
      provider: { sort: "price" },
      serviceTier: "flex",
      sessionId: "tg:main:-100123",
      reasoning: { effort: "low" },
    });
  });

  test("omits the session when the caller has none", () => {
    for (const sessionId of [undefined, null, ""]) {
      const f = buildRequestFields({
        models: ["a/primary"],
        routing: {},
        sessionId,
      });
      expect(f).not.toHaveProperty("sessionId");
    }
  });

  // A `session_id` past the documented 256-char ceiling is rejected, and the
  // rejection costs the whole request. The SDK does not validate it, so the
  // clamp lives here.
  test("clamps an over-long session id to the documented ceiling", () => {
    const f = buildRequestFields({
      models: ["a/primary"],
      routing: {},
      sessionId: "s".repeat(300),
    });
    expect(f.sessionId).toBe("s".repeat(MAX_SESSION_ID_LENGTH));
  });

  test("omits reasoning entirely when no effort is requested", () => {
    const f = buildRequestFields({
      models: ["a/primary"],
      routing: {},
      reasoningEffort: null,
    });
    expect(f).not.toHaveProperty("reasoning");
  });
});

describe("resolveAskCost", () => {
  const totals = (cost: unknown) =>
    ({
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
      cachedTokens: 0,
      reasoningTokens: 0,
      modelCalls: 1,
      cost,
    }) as never;

  test("takes the cost OpenRouter aggregated across the loop", () => {
    const r = resolveAskCost(totals(0.003));
    expect(r.costUsd).toBeCloseTo(0.003, 9);
    expect(r.priced).toBe(true);
  });

  // A free model reports a real zero. That is not the same as reporting
  // nothing, and must not be flagged as an under-count.
  test("treats a reported zero as a real cost", () => {
    const r = resolveAskCost(totals(0));
    expect(r.costUsd).toBe(0);
    expect(r.priced).toBe(true);
  });

  test("a non-finite or non-numeric cost is no cost at all", () => {
    for (const bad of ["0.01", NaN, Infinity, null, {}, undefined]) {
      const r = resolveAskCost(totals(bad));
      expect(r.costUsd).toBe(0);
      expect(r.priced).toBe(false);
    }
  });

  test("no totals at all means the ledger under-counts", () => {
    expect(resolveAskCost(undefined)).toEqual({ costUsd: 0, priced: false });
  });
});

// --- wire harness ----------------------------------------------------------

type Captured = {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
};

// A minimal 200 the SDK's inbound schema accepts. `output` is swapped for a
// `function_call` item to drive a tool round.
function responsePayload(opts: {
  output?: unknown[];
  cost?: number | undefined;
  model?: string;
  toolCall?: { name: string; args: unknown; callId?: string };
}) {
  const output =
    opts.output ??
    (opts.toolCall
      ? [
          {
            type: "function_call",
            id: `fc_${opts.toolCall.callId ?? "1"}`,
            call_id: opts.toolCall.callId ?? "call_1",
            name: opts.toolCall.name,
            arguments: JSON.stringify(opts.toolCall.args),
            status: "completed",
          },
        ]
      : [
          {
            type: "message",
            id: "msg_1",
            role: "assistant",
            status: "completed",
            content: [{ type: "output_text", text: "hello", annotations: [] }],
          },
        ]);
  return {
    id: "resp_1",
    object: "response",
    created_at: 1,
    completed_at: 2,
    error: null,
    incomplete_details: null,
    instructions: null,
    metadata: null,
    model: opts.model ?? "openai/gpt-5",
    output,
    parallel_tool_calls: true,
    presence_penalty: 0,
    frequency_penalty: 0,
    temperature: 1,
    tool_choice: "auto",
    tools: [],
    top_p: 1,
    status: "completed",
    usage: {
      input_tokens: 10,
      input_tokens_details: { cached_tokens: 0 },
      output_tokens: 5,
      output_tokens_details: { reasoning_tokens: 0 },
      total_tokens: 15,
      ...(opts.cost === undefined ? {} : { cost: opts.cost }),
    },
  };
}

// Builds a client whose fetcher records every outgoing request. `reply` decides
// what comes back per call (1-based turn number). The stub is handed a
// `Request`, so the body is read off a clone.
function capturingClient(opts?: {
  reply?: (turn: number, body: Record<string, unknown>) => Response;
  attribution?: { url?: string; title?: string };
  baseURL?: string;
}) {
  const calls: Captured[] = [];
  const reply =
    opts?.reply ??
    (() =>
      new Response(JSON.stringify(responsePayload({ cost: 0.0025 })), {
        status: 200,
        headers: { "content-type": "application/json" },
      }));

  const client = new OpenRouterClient({
    apiKey: "sk-test",
    ...(opts?.baseURL === undefined ? {} : { baseURL: opts.baseURL }),
    ...(opts?.attribution === undefined
      ? {}
      : { attribution: opts.attribution }),
    // No retries in tests: a deliberate 400 must surface as one call, not five.
    retryConfig: { strategy: "none" },
    fetch: async (input, init) => {
      const req =
        input instanceof Request ? input : new Request(String(input), init);
      const body = (await req.clone().json()) as Record<string, unknown>;
      const headers: Record<string, string> = {};
      req.headers.forEach((value, name) => {
        headers[name] = value;
      });
      calls.push({ url: req.url, headers, body });
      return reply(calls.length, body);
    },
  });

  return { client, calls };
}

const askOpts = (over: Partial<Parameters<OpenRouterClient["ask"]>[0]> = {}) => ({
  models: ["a/primary"],
  system: "sys",
  messages: [{ role: "user", content: "hi" }] as AIMessage[],
  tools: [] as Tool[],
  toolCallContext: {} as ToolCallContext,
  ...over,
});

const echoTool: Tool = {
  name: "echo",
  description: "echo back",
  parameters: z.object({ value: z.string() }),
  execute: (input) => ({ echoed: (input as { value: string }).value }),
};

// Reads one labelled sample out of the exposition text the registry renders.
function counterValue(outcome: "success" | "error"): number {
  const line = aiRequestsTotal
    .collect()
    .split("\n")
    .find((l) => l.startsWith(`bot_ai_requests_total{outcome="${outcome}"}`));
  return line ? Number(line.split(" ").pop()) : 0;
}

describe("OpenRouterClient — the request that goes out", () => {
  test("POSTs to {baseURL}/responses with a bearer token", async () => {
    const { client, calls } = capturingClient({
      baseURL: "https://gateway.test/api/v1",
    });
    await client.ask(askOpts());
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://gateway.test/api/v1/responses");
    expect(calls[0]!.headers.authorization).toBe("Bearer sk-test");
  });

  // The SDK renamed the attribution title header to `X-OpenRouter-Title`, but
  // `X-Title` is the one OpenRouter's public docs name. Both go out; dropping
  // either is a deliberate change, not a silent one.
  test("sends both attribution title headers plus the referer", async () => {
    const { client, calls } = capturingClient({
      attribution: { url: "https://example.com", title: "any_talker" },
    });
    await client.ask(askOpts());
    const h = calls[0]!.headers;
    expect(h["http-referer"]).toBe("https://example.com");
    expect(h["x-openrouter-title"]).toBe("any_talker");
    expect(h["x-title"]).toBe("any_talker");
  });

  test("sends no attribution header when none is configured", async () => {
    const { client, calls } = capturingClient();
    await client.ask(askOpts());
    const h = calls[0]!.headers;
    expect(h["http-referer"]).toBeUndefined();
    expect(h["x-openrouter-title"]).toBeUndefined();
    expect(h["x-title"]).toBeUndefined();
  });

  test("the fallback chain travels as model + models", async () => {
    const { client, calls } = capturingClient();
    await client.ask(askOpts({ models: ["a/primary", "b/backup", "c/last"] }));
    expect(calls[0]!.body.model).toBe("a/primary");
    expect(calls[0]!.body.models).toEqual(["b/backup", "c/last"]);
  });

  test("a single-model ask sends no models key at all", async () => {
    const { client, calls } = capturingClient();
    await client.ask(askOpts());
    expect(calls[0]!.body).not.toHaveProperty("models");
  });

  test("a pinned provider goes out snake-cased with fallbacks off", async () => {
    const { client, calls } = capturingClient();
    await client.ask(
      askOpts({ routing: { provider: "deepinfra", providerSort: "price" } }),
    );
    expect(calls[0]!.body.provider).toEqual({
      order: ["deepinfra"],
      allow_fallbacks: false,
    });
  });

  test("a sort alone goes out as a sort; neither sends no provider", async () => {
    const sorted = capturingClient();
    await sorted.client.ask(askOpts({ routing: { providerSort: "price" } }));
    expect(sorted.calls[0]!.body.provider).toEqual({ sort: "price" });

    const bare = capturingClient();
    await bare.client.ask(askOpts({ routing: {} }));
    expect(bare.calls[0]!.body).not.toHaveProperty("provider");
    // Unlike `provider`, an unset tier is not omitted: the SDK's outbound
    // schema defaults it, so `service_tier: "auto"` rides on every request the
    // bot does not give a tier of its own.
    expect(bare.calls[0]!.body.service_tier).toBe("auto");
  });

  test("the service tier reaches the wire", async () => {
    const { client, calls } = capturingClient();
    await client.ask(askOpts({ routing: { serviceTier: "flex" } }));
    expect(calls[0]!.body.service_tier).toBe("flex");
  });

  test("the session id reaches the wire, clamped; absent when falsy", async () => {
    const set = capturingClient();
    await set.client.ask(askOpts({ sessionId: "s".repeat(300) }));
    expect(set.calls[0]!.body.session_id).toBe(
      "s".repeat(MAX_SESSION_ID_LENGTH),
    );

    const unset = capturingClient();
    await unset.client.ask(askOpts({ sessionId: null }));
    expect(unset.calls[0]!.body).not.toHaveProperty("session_id");
  });

  test("the reasoning effort goes out as a unified object", async () => {
    const set = capturingClient();
    await set.client.ask(askOpts({ reasoningEffort: "high" }));
    expect(set.calls[0]!.body.reasoning).toEqual({ effort: "high" });

    const unset = capturingClient();
    await unset.client.ask(askOpts({ reasoningEffort: null }));
    expect(unset.calls[0]!.body).not.toHaveProperty("reasoning");
  });

  // The system prompt is the cacheable prefix: it must ride on `instructions`
  // and must never appear as an input item, or every warm cache splits.
  test("the system prompt is instructions, never an input item", async () => {
    const { client, calls } = capturingClient();
    await client.ask(askOpts({ system: "you are a bot" }));
    expect(calls[0]!.body.instructions).toBe("you are a bot");
    const input = calls[0]!.body.input as unknown[];
    expect(input.every((i) => (i as { role?: string }).role !== "system")).toBe(
      true,
    );
    expect(input).toEqual([{ role: "user", content: "hi" }]);
  });

  test("an empty tool registry sends no tools key", async () => {
    const { client, calls } = capturingClient();
    await client.ask(askOpts({ tools: [] }));
    expect(calls[0]!.body).not.toHaveProperty("tools");
  });

  test("a tool is serialized as a draft-7 function schema", async () => {
    const { client, calls } = capturingClient();
    const refined: Tool = {
      name: "refined",
      description: "a refined object schema",
      parameters: z
        .object({ value: z.string() })
        .refine((v) => v.value.length > 0),
      execute: () => ({}),
    };
    await client.ask(askOpts({ tools: [echoTool, refined] }));
    const schema = {
      $schema: "http://json-schema.org/draft-07/schema#",
      type: "object",
      properties: { value: { type: "string" } },
      required: ["value"],
      additionalProperties: false,
    };
    const tools = calls[0]!.body.tools as Record<string, unknown>[];
    expect(tools[0]).toEqual({
      type: "function",
      name: "echo",
      description: "echo back",
      parameters: schema,
      strict: null,
    });
    // The refinement is dropped by JSON-Schema conversion (it still runs on
    // parse), exactly as it did before the migration.
    expect(tools[1]!.name).toBe("refined");
    expect(tools[1]!.parameters).toEqual(schema);
  });

  test("a clip goes out as a native input_video item", async () => {
    const { client, calls } = capturingClient();
    await client.ask(
      askOpts({
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "what happens here" },
              {
                type: "video",
                video: new Uint8Array([0, 1, 2, 3]),
                mediaType: "video/mp4",
              },
            ],
          },
        ],
      }),
    );
    const input = calls[0]!.body.input as { content: unknown }[];
    expect(input[0]!.content).toEqual([
      { type: "input_text", text: "what happens here" },
      { type: "input_video", video_url: "data:video/mp4;base64,AAECAw==" },
    ]);
  });
});

describe("OpenRouterClient — the result that comes back", () => {
  // The single most important test in the suite: the only guard against
  // reading per-call usage (`getResponse().usage`, which covers the final call
  // only) instead of the loop-aggregated `SessionEnd.totalUsage`.
  test("cost and tokens are aggregated across the whole tool loop", async () => {
    const { client, calls } = capturingClient({
      reply: (turn) =>
        new Response(
          JSON.stringify(
            responsePayload(
              turn === 1
                ? { cost: 0.0025, toolCall: { name: "echo", args: { value: "x" } } }
                : { cost: 0.0025 },
            ),
          ),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    });

    const result = await client.ask(askOpts({ tools: [echoTool] }));
    expect(calls).toHaveLength(2);
    expect(result.text).toBe("hello");
    expect(result.costUsd).toBeCloseTo(0.005, 9);
    expect(result.totalTokens).toBe(30);
    expect(result.priced).toBe(true);
  });

  test("a reported zero is a real cost, not a missing one", async () => {
    const { client } = capturingClient({
      reply: () =>
        new Response(JSON.stringify(responsePayload({ cost: 0 })), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    });
    const result = await client.ask(askOpts());
    expect(result.costUsd).toBe(0);
    expect(result.priced).toBe(true);
  });

  test("no reported cost floors at $0 and flags the ledger", async () => {
    const { client } = capturingClient({
      reply: () =>
        new Response(JSON.stringify(responsePayload({})), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    });
    const result = await client.ask(askOpts());
    expect(result.costUsd).toBe(0);
    expect(result.priced).toBe(false);
  });

  // Spend is bucketed per model id (`at:spend_model:*`). Returning the model
  // that actually answered would silently re-key every existing bucket.
  test("modelId is the primary even when another model answered", async () => {
    const { client } = capturingClient({
      reply: () =>
        new Response(
          JSON.stringify(responsePayload({ model: "b/backup", cost: 0.001 })),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    });
    const result = await client.ask(
      askOpts({ models: ["a/primary", "b/backup"] }),
    );
    expect(result.modelId).toBe("a/primary");
  });

  // `turn.ts` only charges and stores a turn that resolved, so a failed ask
  // must throw rather than resolve with an empty result.
  test("throws on an HTTP 400 rather than resolving empty", async () => {
    const { client } = capturingClient({
      reply: () =>
        new Response(JSON.stringify({ error: { message: "bad model" } }), {
          status: 400,
          headers: { "content-type": "application/json" },
        }),
    });
    expect(client.ask(askOpts())).rejects.toThrow();
  });

  test("throws when the fetcher itself fails", async () => {
    const client = new OpenRouterClient({
      apiKey: "sk-test",
      retryConfig: { strategy: "none" },
      fetch: async () => {
        throw new Error("econnreset");
      },
    });
    expect(client.ask(askOpts())).rejects.toThrow();
  });

  test("an empty model chain is rejected before any request", async () => {
    const { client, calls } = capturingClient();
    expect(client.ask(askOpts({ models: [] }))).rejects.toThrow(
      "at least one model id is required (got 0)",
    );
    expect(calls).toHaveLength(0);
  });

  // The context carries a mutable `effects` array the caller reads back after
  // the ask, so it must arrive by closure — not through a serializing context
  // boundary that would hand the tool a copy.
  test("the tool call context arrives by identity, effects and all", async () => {
    const ctx = {
      source: "ask",
      chatId: "1",
      userId: "2",
      replyToMessageId: null,
      timezone: "UTC",
      lang: "en",
      now: 0,
      effects: [],
    } as unknown as ToolCallContext;

    let seen: ToolCallContext | undefined;
    const spy: Tool = {
      name: "spy",
      description: "records its context",
      parameters: z.object({ value: z.string() }),
      execute: (_input, c) => {
        seen = c;
        c.effects?.push({
          type: "settings_updated",
          changes: [],
        });
        return { ok: true };
      },
    };

    const { client } = capturingClient({
      reply: (turn) =>
        new Response(
          JSON.stringify(
            responsePayload(
              turn === 1
                ? { cost: 0, toolCall: { name: "spy", args: { value: "x" } } }
                : { cost: 0 },
            ),
          ),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    });

    await client.ask(askOpts({ tools: [spy], toolCallContext: ctx }));
    expect(seen).toBe(ctx);
    expect(ctx.effects).toHaveLength(1);
  });

  // The metric is documented as one observation per `ask()`. Hooking the HTTP
  // layer instead would count every model call and inflate the dashboards.
  test("a multi-call ask is one metric observation", async () => {
    const before = counterValue("success");
    const { client, calls } = capturingClient({
      reply: (turn) =>
        new Response(
          JSON.stringify(
            responsePayload(
              turn === 1
                ? { cost: 0, toolCall: { name: "echo", args: { value: "x" } } }
                : { cost: 0 },
            ),
          ),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    });
    await client.ask(askOpts({ tools: [echoTool] }));
    expect(calls).toHaveLength(2);
    expect(counterValue("success") - before).toBe(1);
  });

  test("a failed ask is counted as an error, once", async () => {
    const before = counterValue("error");
    const { client } = capturingClient({
      reply: () => new Response("{}", { status: 400 }),
    });
    await client.ask(askOpts()).catch(() => {});
    expect(counterValue("error") - before).toBe(1);
  });
});

describe("OpenRouterClient — the loop bound and the final turn", () => {
  // What the ceiling is actually measured in. Cost, latency and the top bucket
  // of `bot_ai_request_duration_seconds` all key off model calls, and the old
  // `generateText({ stopWhen: stepCountIs(8) })` allowed 8 of them. This is
  // the loop's own bound; the empty-final retry can add one on top.
  const MAX_MODEL_CALLS = 8;

  // Every reply is a tool call, so the loop runs to the cap.
  function runawayClient() {
    return capturingClient({
      reply: (turn) =>
        new Response(
          JSON.stringify(
            responsePayload({
              cost: 0.001,
              toolCall: {
                name: "echo",
                args: { value: `t${turn}` },
                callId: `call_${turn}`,
              },
            }),
          ),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    });
  }

  // The rounds-to-calls arithmetic is n + 2, not n + 1: the loop breaks
  // holding a response that still carries tool calls, and the agent then
  // executes that pending round *and* makes the final tool-free call. Getting
  // this off by one would silently raise the per-ask cost and latency ceiling,
  // so it is pinned end-to-end rather than reasoned about.
  test("8 model calls when the final turn returns content", async () => {
    const { client, calls } = runawayClient();
    await client.ask(askOpts({ tools: [echoTool] }));
    expect(MAX_TOOL_ROUNDS).toBe(6);
    expect(calls).toHaveLength(MAX_MODEL_CALLS);
  });

  // The true worst case: the cap is hit *and* the final turn comes back empty,
  // so the library's one empty-final retry (unlocked by leaving
  // `strictFinalResponse` unset) lands on top of the 8. Nothing beyond this —
  // the retry does not re-enter the loop.
  test("9 model calls when the capped final turn returns empty", async () => {
    const { client, calls } = capturingClient({
      reply: (turn) =>
        new Response(
          JSON.stringify(
            responsePayload(
              turn <= MAX_MODEL_CALLS - 1
                ? {
                    cost: 0.001,
                    toolCall: {
                      name: "echo",
                      args: { value: `t${turn}` },
                      callId: `call_${turn}`,
                    },
                  }
                : { cost: 0.001, output: [] },
            ),
          ),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    });

    const result = await client.ask(askOpts({ tools: [echoTool] }));
    expect(result.text).toBe("");
    expect(calls).toHaveLength(MAX_MODEL_CALLS + 1);
  });

  // `allowFinalResponse: ""` forbids tool calls on the final turn but appends
  // nothing. The default injects a hardcoded English user message into an
  // en|ru conversation — a silent conversation mutation this bot does not do.
  test("the final turn appends no directive message", async () => {
    const { client, calls } = runawayClient();
    await client.ask(askOpts({ tools: [echoTool] }));

    const last = calls.at(-1)!;
    const input = last.body.input as { role?: string; type?: string }[];
    expect(input.at(-1)!.type).toBe("function_call_output");
    expect(input.some((i) => i.role === "user" && i !== input[0])).toBe(false);
    expect(JSON.stringify(last.body)).not.toContain("tool-use limit");

    // Tools stay in the request so the cache prefix survives; only calling
    // them is forbidden.
    expect(last.body.tool_choice).toBe("none");
    expect(last.body.tools).toBeDefined();
    expect((last.body.tools as unknown[]).length).toBeGreaterThan(0);
  });

  // `strictFinalResponse` is left unset on purpose: a throw here would drop a
  // real, billed ask out of the ledger. `ask.ts` turns the empty text into a
  // user-visible error instead. If someone sets it, this test goes red.
  test("an empty final output resolves to \"\" and is still charged", async () => {
    const before = counterValue("success");
    const { client, calls } = capturingClient({
      reply: (turn) =>
        new Response(
          JSON.stringify(
            responsePayload(
              turn === 1
                ? {
                    cost: 0.002,
                    toolCall: { name: "echo", args: { value: "x" } },
                  }
                : { cost: 0.002, output: [] },
            ),
          ),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    });

    const result = await client.ask(askOpts({ tools: [echoTool] }));
    expect(result.text).toBe("");
    // One tool round, the empty final turn, and the one retry of it.
    expect(calls).toHaveLength(3);
    expect(result.costUsd).toBeGreaterThan(0);
    expect(result.priced).toBe(true);
    expect(counterValue("success") - before).toBe(1);
  });
});
