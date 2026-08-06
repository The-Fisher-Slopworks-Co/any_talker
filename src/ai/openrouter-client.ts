// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import {
  callModel,
  OpenRouter,
  stepCountIs,
  tool as agentTool,
} from "@openrouter/agent";
import type {
  RequestOptions,
  ResponsesRequest,
  SDKOptions,
  SessionUsageTotals,
  Tool as AgentTool,
} from "@openrouter/agent";
import { HTTPClient } from "@openrouter/sdk";
import type { Fetcher } from "@openrouter/sdk";
import type { AIClient, AIMessage, AskResult, RoutingOptions } from "./types";
import type { Tool, ToolCallContext } from "./tools/registry";
import type { ProviderSort, ReasoningEffort } from "../shared/types";
import { toResponsesInput } from "./responses-input";
import { proxiedFetch } from "../proxy";
import { aiRequestDurationSeconds, aiRequestsTotal } from "../metrics";

// The documented ceiling on `session_id`. A longer value is rejected, and the
// rejection costs the whole request — the SDK does not validate it, so the id
// is clamped here, at the wire boundary, rather than every caller being trusted
// to keep it short.
export const MAX_SESSION_ID_LENGTH = 256;

// Completed tool-execution rounds after which the agent's loop is cut short.
//
// `stepCountIs(n)` counts ROUNDS, not model calls, and the arithmetic from
// rounds to calls is `n + 2`, not `n + 1`: the loop tests the condition at the
// top of each iteration, so it breaks holding a response that still carries
// tool calls (call n+1); the agent then executes that pending round and makes
// one further tool-free model call for the final answer (call n+2). See
// `agent/esm/lib/model-result.js` — the `while (true)` loop at :2284 pushes to
// `allToolExecutionRounds` at :2369 and re-requests at :2408, then
// `makeFinalResponseRequest` at :2478.
//
// 6 therefore means at most 7 tool rounds and 8 model calls per ask — 9 when
// the final turn comes back with `output: []` after at least one tool round,
// which the library re-sends once because `strictFinalResponse` is left unset
// (`model-result.js:2486`; the `getText()` call below says why it is unset).
// The old `generateText({ stopWhen: stepCountIs(8) })` was a hard 8 with no
// such retry, so the ceilings match on every ask except that one. Cost,
// latency and the top bucket of `bot_ai_request_duration_seconds` all key off
// model calls, so that is the number parity is measured on. Pinned by a test.
export const MAX_TOOL_ROUNDS = 6;

export const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";

// The SDK's own defaults are `timeoutMs: -1` (none) and a retry budget of one
// hour, which would hang an ask far past Telegram's typing window and past the
// top bucket of `bot_ai_request_duration_seconds`. Both are set explicitly.
export const DEFAULT_TIMEOUT_MS = 180_000;
export const DEFAULT_RETRY_CONFIG: NonNullable<SDKOptions["retryConfig"]> = {
  strategy: "backoff",
  backoff: {
    initialInterval: 500,
    maxInterval: 4000,
    exponent: 2,
    maxElapsedTime: 20_000,
  },
  retryConnectionErrors: true,
};

// App attribution, sent as request headers so OpenRouter can credit the traffic
// to this bot.
export type AppAttribution = {
  url?: string | undefined;
  title?: string | undefined;
};

// The `provider` field of a Responses request (camelCase in TS, snake on the
// wire).
export type ProviderRouting = NonNullable<ResponsesRequest["provider"]>;

// A pinned provider wins over a sort: the request is restricted to that single
// slug with fallbacks disabled, so it never silently lands elsewhere.
export function buildProviderRouting(
  provider: string | null | undefined,
  providerSort: ProviderSort | null | undefined,
): ProviderRouting | undefined {
  if (provider) return { order: [provider], allowFallbacks: false };
  if (providerSort) return { sort: providerSort };
  return undefined;
}

// The routing/identity fields of one ask — everything except instructions,
// input and tools. Every one of them is always sent: OpenRouter honours them
// all, so there is no capability gate left to consult.
export function buildRequestFields(opts: {
  // The full chain; [0] is the primary.
  models: string[];
  routing: RoutingOptions;
  reasoningEffort?: ReasoningEffort | null;
  // Stable id of the conversation this request belongs to (`ai/session.ts`).
  sessionId?: string | null;
}): {
  model: string;
  models?: string[];
  provider?: ProviderRouting;
  serviceTier?: NonNullable<ResponsesRequest["serviceTier"]>;
  sessionId?: string;
  reasoning?: { effort: ReasoningEffort };
} {
  const [primary, ...fallbacks] = opts.models;
  // `ask` rejects an empty chain before it gets here, so the fallback only
  // exists to keep `model` a plain `string` for callers of this helper.
  const out: ReturnType<typeof buildRequestFields> = { model: primary ?? "" };

  // The `model` + `models` pair as OpenRouter reads it: the primary alone in
  // `model`, the rest of the chain in `models`. Omitted entirely when there is
  // nothing to fall back to — an empty array is not the same request.
  if (fallbacks.length > 0) out.models = fallbacks;

  const provider = buildProviderRouting(
    opts.routing.provider,
    opts.routing.providerSort,
  );
  if (provider) out.provider = provider;

  if (opts.routing.serviceTier) out.serviceTier = opts.routing.serviceTier;

  // Sticky routing: keeps the conversation on the provider whose prompt cache
  // is already warm for it. Advisory, and deliberately so — a pinned provider
  // still wins, since an explicit `provider.order` outranks stickiness.
  if (opts.sessionId) {
    out.sessionId = opts.sessionId.slice(0, MAX_SESSION_ID_LENGTH);
  }

  if (opts.reasoningEffort) out.reasoning = { effort: opts.reasoningEffort };

  return out;
}

// What one ask cost and whether that figure is complete.
//
// OpenRouter states the real price (cache discounts, BYOK, reasoning tokens and
// server-tool usage included) and aggregates it across every model call in the
// tool-calling loop, so its figure is the only one used. A reported 0 is a real
// cost (a free model); anything non-finite or absent means OpenRouter said
// nothing, so the cost floors at 0 and `priced` goes false — the ledger's blind
// spot stays visible instead of being mistaken for a free reply.
export function resolveAskCost(totals: SessionUsageTotals | undefined): {
  costUsd: number;
  priced: boolean;
} {
  const cost = totals?.cost;
  if (typeof cost === "number" && Number.isFinite(cost)) {
    return { costUsd: cost, priced: true };
  }
  return { costUsd: 0, priced: false };
}

// AI client for OpenRouter's Responses API, driven by `@openrouter/agent`'s
// `callModel` tool loop. Everything the bot can configure — a fallback chain,
// provider routing, a service tier, a session id, a reasoning effort — is
// always sent; OpenRouter honours all of it.
export class OpenRouterClient implements AIClient {
  private readonly client: OpenRouter;
  // OpenRouter's documented attribution header. `SDKOptions.appTitle` only
  // emits `X-OpenRouter-Title`, and `RequestOptions.headers` is merged into
  // every request by `callModel` and `_createRequest`, so both go out.
  private readonly titleHeader: RequestOptions | undefined;

  constructor(opts: {
    apiKey: string;
    baseURL?: string;
    attribution?: AppAttribution;
    // Defaults to the proxy-aware fetch. Injectable so tests can assert the
    // request body that actually goes on the wire.
    fetch?: Fetcher;
    timeoutMs?: number;
    retryConfig?: SDKOptions["retryConfig"];
  }) {
    this.client = new OpenRouter({
      apiKey: opts.apiKey,
      serverURL: opts.baseURL ?? DEFAULT_BASE_URL,
      ...(opts.attribution?.url ? { httpReferer: opts.attribution.url } : {}),
      ...(opts.attribution?.title ? { appTitle: opts.attribution.title } : {}),
      httpClient: new HTTPClient({ fetcher: opts.fetch ?? proxiedFetch }),
      timeoutMs: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      retryConfig: opts.retryConfig ?? DEFAULT_RETRY_CONFIG,
    });
    this.titleHeader = opts.attribution?.title
      ? { headers: { "X-Title": opts.attribution.title } }
      : undefined;
  }

  async ask(opts: {
    models: string[];
    system: string;
    messages: AIMessage[];
    tools: Tool[];
    routing?: RoutingOptions;
    reasoningEffort?: ReasoningEffort | null;
    sessionId?: string | null;
    toolCallContext: ToolCallContext;
  }): Promise<AskResult> {
    const primary = opts.models[0];
    if (!primary) {
      throw new Error(
        `at least one model id is required (got ${opts.models.length})`,
      );
    }

    // Built per ask, closing over this turn's context. Deliberately not
    // memoized: a cache keyed on the tool list would capture one turn's
    // `effects`/`contextMessages` and leak them into another.
    const tools = toAgentTools(opts.tools, opts.toolCallContext);

    // Filled by the SessionEnd hook, which the agent runs in the `finally` of
    // its tool loop — so it has already fired by the time `getText()` resolves,
    // including on the error path. This is the only loop-aggregated usage
    // figure the agent exposes; `getResponse().usage` covers the final call
    // only and would under-count every tool-using ask.
    let totals: SessionUsageTotals | undefined;

    const start = performance.now();
    let outcome: "success" | "error" = "success";
    try {
      const result = callModel(
        this.client,
        {
          ...buildRequestFields({
            models: opts.models,
            routing: opts.routing ?? {},
            reasoningEffort: opts.reasoningEffort,
            sessionId: opts.sessionId,
          }),
          // Never an input item: this is the cacheable prompt prefix.
          instructions: opts.system,
          input: toResponsesInput(opts.messages),
          // Never emit `"tools": []` — that is a different request.
          ...(tools.length > 0 ? { tools } : {}),
          // Counts TOOL ROUNDS, not model calls — see MAX_TOOL_ROUNDS for the
          // rounds-to-calls arithmetic. Ceiling: 8 model calls per ask, 9 if
          // the empty-final retry fires.
          stopWhen: stepCountIs(MAX_TOOL_ROUNDS),
          // "" = forbid tool calls on the final turn but append NOTHING. The
          // default (`true`/omitted) injects a hardcoded English user message
          // into an en|ru conversation governed by a strict response format;
          // "" reproduces the old `generateText` wire exactly.
          allowFinalResponse: "",
          hooks: {
            SessionEnd: [
              {
                handler: (payload) => {
                  totals = payload.totalUsage;
                },
              },
            ],
          },
        },
        this.titleHeader,
      );

      // Throws on any API/network failure, so a failed ask is never charged.
      // May legitimately resolve to "" when a tool-using run comes back with an
      // empty final output — `ask.ts` turns that into `kind:"error"`. We do NOT
      // set `strictFinalResponse`, because a throw here would drop a real,
      // billed ask out of the ledger.
      const text = await result.getText();
      const { costUsd, priced } = resolveAskCost(totals);

      return {
        text,
        totalTokens: totals?.totalTokens ?? 0,
        // The primary is what spend is attributed to. OpenRouter falling back
        // to a later id in the chain bills that one instead, so the attribution
        // (not the total) can be off by one model on a fallback — the reported
        // cost stays correct either way.
        modelId: primary,
        costUsd,
        priced,
      };
    } catch (err) {
      outcome = "error";
      throw err;
    } finally {
      const seconds = (performance.now() - start) / 1000;
      aiRequestsTotal.inc({ outcome });
      aiRequestDurationSeconds.observe({ outcome }, seconds);
    }
  }
}

// Wraps each registered tool as an agent tool. The `ToolCallContext` travels by
// closure rather than through the agent's typed `contextSchema`: it carries a
// mutable `effects` array the caller reads back after the ask, and
// `contextMessages` with `Uint8Array` media — neither survives a serialization
// boundary.
function toAgentTools(tools: Tool[], ctx: ToolCallContext): AgentTool[] {
  return tools.map((t) =>
    agentTool({
      name: t.name,
      description: t.description,
      inputSchema: t.parameters,
      execute: async (input: unknown) => t.execute(input, ctx),
    }),
  );
}
