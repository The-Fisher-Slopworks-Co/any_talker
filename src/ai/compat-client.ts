// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import {
  generateText,
  tool as aiTool,
  stepCountIs,
  type JSONValue,
  type ModelMessage,
  type ToolSet,
} from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type {
  AIClient,
  AIMessage,
  AIUserContentPart,
  AskResult,
  RoutingOptions,
} from "./types";
import type { Tool, ToolCallContext } from "./tools/registry";
import type { ProviderSort, ReasoningEffort } from "../shared/types";
import type { PriceLookup } from "./model-catalog";
import type { ProviderCapabilities } from "./provider-profile";
import { proxiedFetch } from "../proxy";
import { aiRequestDurationSeconds, aiRequestsTotal } from "../metrics";

// The provider name doubles as the `providerOptions` key the SDK reads chat
// options under (it matches the segment before the first "."). Keys the SDK's
// own chat-options schema knows — `reasoningEffort` — are mapped to their
// standard body field; every other key is spread into the request body verbatim,
// which is how the gateway-specific fields below travel.
const PROVIDER_NAME = "compat";

type CompatProvider = ReturnType<typeof createOpenAICompatible>;

// App attribution, sent as request headers so a gateway can credit the traffic
// to this bot. Ignored by endpoints that don't know the headers.
export type AppAttribution = {
  url?: string | undefined;
  title?: string | undefined;
};

// The `provider` body field a routing-capable gateway accepts: either sort all
// providers by a metric, or pin one with no fallback.
export type ProviderRouting =
  | { sort: ProviderSort }
  | { order: string[]; allow_fallbacks: boolean };

// A pinned provider wins over a sort: the request is restricted to that single
// slug with fallbacks disabled, so it never silently lands elsewhere.
export function buildProviderRouting(
  provider: string | null | undefined,
  providerSort: ProviderSort | null | undefined,
): ProviderRouting | undefined {
  if (provider) return { order: [provider], allow_fallbacks: false };
  if (providerSort) return { sort: providerSort };
  return undefined;
}

// Assembles the per-request `providerOptions` payload, gated on what the
// configured endpoint actually supports. Nothing beyond the standard OpenAI
// surface is emitted for a generic endpoint — a strict one (OpenAI's own API
// among them) rejects the *whole* request with HTTP 400 over one unknown field.
// Returns undefined when there is nothing to send.
export function buildProviderOptions(
  caps: ProviderCapabilities,
  opts: {
    // Model ids after the primary, i.e. the server-side fallback chain.
    fallbackModels: string[];
    routing: RoutingOptions;
    reasoningEffort?: ReasoningEffort | null;
  },
): Record<string, JSONValue> | undefined {
  const out: Record<string, JSONValue> = {};

  if (caps.usageAccounting) {
    // Belt and braces: usage accounting is on by default on today's gateways,
    // but asking for it explicitly costs nothing and keeps older ones honest.
    out.usage = { include: true };
  }
  if (caps.modelFallback && opts.fallbackModels.length > 0) {
    out.models = opts.fallbackModels;
  }
  if (caps.providerRouting) {
    const routing = buildProviderRouting(
      opts.routing.provider,
      opts.routing.providerSort,
    );
    if (routing) out.provider = routing;
  }
  if (caps.serviceTier && opts.routing.serviceTier) {
    out.service_tier = opts.routing.serviceTier;
  }
  if (opts.reasoningEffort) {
    if (caps.unifiedReasoning) out.reasoning = { effort: opts.reasoningEffort };
    // Consumed by the SDK's chat-options schema and mapped to `reasoning_effort`.
    else out.reasoningEffort = opts.reasoningEffort;
  }

  return Object.keys(out).length > 0 ? out : undefined;
}

export function buildAttributionHeaders(
  attr: AppAttribution,
): Record<string, string> {
  const headers: Record<string, string> = {};
  if (attr.url) headers["HTTP-Referer"] = attr.url;
  if (attr.title) headers["X-Title"] = attr.title;
  return headers;
}

// One `generateText` step, narrowed to the raw response body the cost reader
// inspects. Structural, so the real `StepResult` satisfies it.
type CostBearingStep = { response?: { body?: unknown } };

// Reads the USD cost a usage-accounting gateway reported for each step. With
// tool calls one ask fans out into several billed requests, so the per-step
// figures are summed the way `totalUsage` sums tokens. Returns null when no step
// reported a usable number — distinct from a reported zero, which a free model
// legitimately produces.
function readReportedCostUsd(steps: readonly CostBearingStep[]): number | null {
  let total = 0;
  let reported = false;
  for (const s of steps) {
    const body = s.response?.body as { usage?: { cost?: unknown } } | undefined;
    const cost = body?.usage?.cost;
    if (typeof cost === "number" && Number.isFinite(cost)) {
      total += cost;
      reported = true;
    }
  }
  return reported ? total : null;
}

// What one ask cost, and whether that figure can be trusted as complete.
//
// A usage-accounting gateway states the real price (discounts, cache reads and
// reasoning tokens included), so it wins. Everything else — and any such gateway
// that stayed silent — is priced locally from the catalogue: `inputTokens ×
// promptPrice + outputTokens × completionPrice`. With no catalogue pricing the
// cost floors at 0 and `priced` goes false, so the ledger's blind spot is
// visible instead of being mistaken for a free reply.
export function resolveAskCost(args: {
  caps: ProviderCapabilities;
  pricing: PriceLookup;
  modelId: string;
  steps: readonly CostBearingStep[];
  inputTokens: number;
  outputTokens: number;
}): { costUsd: number; priced: boolean } {
  if (args.caps.usageAccounting) {
    const reported = readReportedCostUsd(args.steps);
    if (reported !== null) return { costUsd: reported, priced: true };
  }
  return {
    costUsd: computeCostUsd(
      args.pricing,
      args.modelId,
      args.inputTokens,
      args.outputTokens,
    ),
    priced: args.pricing.getPricing(args.modelId) !== null,
  };
}

// AI client for any OpenAI-compatible chat-completions endpoint. What it sends
// beyond the standard surface — a fallback chain, provider routing, a service
// tier — and whether it trusts the response for cost is decided entirely by the
// injected `ProviderCapabilities`.
export class OpenAICompatClient implements AIClient {
  private readonly provider: CompatProvider;
  private readonly pricing: PriceLookup;
  private readonly capabilities: ProviderCapabilities;

  constructor(opts: {
    baseURL: string;
    apiKey: string;
    pricing: PriceLookup;
    capabilities: ProviderCapabilities;
    attribution?: AppAttribution;
    // Defaults to the proxy-aware fetch. Injectable so tests can assert the
    // request body the provider package actually produces — the capability gate
    // is only as good as that contract, and so is the video escape hatch below.
    fetch?: typeof globalThis.fetch;
  }) {
    this.pricing = opts.pricing;
    this.capabilities = opts.capabilities;
    this.provider = createOpenAICompatible({
      name: PROVIDER_NAME,
      baseURL: opts.baseURL,
      apiKey: opts.apiKey,
      fetch: opts.fetch ?? proxiedFetch,
      headers: buildAttributionHeaders(opts.attribution ?? {}),
    });
  }

  async ask(opts: {
    models: string[];
    system: string;
    messages: AIMessage[];
    tools: Tool[];
    routing?: RoutingOptions;
    reasoningEffort?: ReasoningEffort | null;
    toolCallContext: ToolCallContext;
  }): Promise<AskResult> {
    const [primary, ...fallbacks] = opts.models;
    if (!primary) {
      throw new Error(
        `at least one model id is required (got ${opts.models.length})`,
      );
    }

    const toolMap: ToolSet = Object.fromEntries(
      opts.tools.map((t) => [
        t.name,
        aiTool({
          description: t.description,
          inputSchema: t.parameters,
          execute: async (input: unknown) =>
            t.execute(input, opts.toolCallContext),
        }),
      ]),
    );

    const compatOptions = buildProviderOptions(this.capabilities, {
      fallbackModels: fallbacks,
      routing: opts.routing ?? {},
      reasoningEffort: opts.reasoningEffort,
    });

    const start = performance.now();
    let outcome: "success" | "error" = "success";
    try {
      const result = await generateText({
        model: this.provider(primary),
        system: opts.system,
        messages: toModelMessages(opts.messages),
        tools: Object.keys(toolMap).length > 0 ? toolMap : undefined,
        stopWhen: stepCountIs(8),
        providerOptions: compatOptions
          ? { [PROVIDER_NAME]: compatOptions }
          : undefined,
      });

      const { costUsd, priced } = resolveAskCost({
        caps: this.capabilities,
        pricing: this.pricing,
        modelId: primary,
        steps: result.steps,
        inputTokens: result.totalUsage.inputTokens ?? 0,
        outputTokens: result.totalUsage.outputTokens ?? 0,
      });

      return {
        text: result.text,
        totalTokens: result.totalUsage.totalTokens ?? 0,
        // The primary is what spend is attributed to. A gateway that fell back
        // to a later id in the chain bills that one instead, so the attribution
        // (not the total) can be off by one model on a fallback — the reported
        // cost, when there is one, stays correct either way.
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

// USD cost for one ask, from the catalogue's per-token prices. Returns 0 when the
// model isn't priced (e.g. a bare OpenAI `/models` response with no pricing),
// making `addUserSpend` a no-op rather than recording a fabricated cost.
export function computeCostUsd(
  pricing: PriceLookup,
  modelId: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const p = pricing.getPricing(modelId);
  if (!p) return 0;
  return inputTokens * p.promptPerToken + outputTokens * p.completionPerToken;
}

// Maps our domain messages onto the AI SDK prompt format. Audio parts become
// generic `file` parts; the openai-compatible provider converts an `audio/*`
// file part into the `input_audio` body field — but it accepts only wav/mp3, so
// callers must transcode Telegram's ogg voice notes before they reach here.
//
// Video is the exception. Endpoints do take it (OpenRouter's `video_url` part,
// which Gemini consumes natively), but `@ai-sdk/openai-compatible` has no video
// mapping at all — not in the installed 2.x, not in 3.x — and throws
// `UnsupportedFunctionalityError` on any `video/*` file part. So a message
// carrying a clip is emitted through the provider's own escape hatch instead:
// `providerOptions.openaiCompatible` is spread over the built message *after*
// `content`, so a `content` key there replaces what the converter produced. The
// SDK-visible content stays a single text part (which the converter is happy
// with) and the body that goes out is the array we built by hand.
//
// `compat-client.test.ts` asserts the emitted request body, so an SDK upgrade
// that changes this mechanism fails loudly instead of silently dropping video.
function toModelMessages(messages: AIMessage[]): ModelMessage[] {
  return messages.map((m) => {
    if (m.role === "assistant") return { role: "assistant", content: m.content };
    if (typeof m.content === "string") return { role: "user", content: m.content };

    if (m.content.some((p) => p.type === "video")) {
      const text = m.content.find((p) => p.type === "text");
      return {
        role: "user",
        content: [
          {
            type: "text",
            text: text?.type === "text" ? text.text : "",
            providerOptions: {
              openaiCompatible: { content: toOpenAIContent(m.content) },
            },
          },
        ],
      };
    }

    return {
      role: "user",
      content: m.content.map((part) => {
        switch (part.type) {
          case "text":
            return { type: "text", text: part.text };
          case "image":
            return { type: "image", image: part.image, mediaType: part.mediaType };
          case "audio":
            return { type: "file", data: part.audio, mediaType: part.mediaType };
          case "video":
            // Unreachable: a video-carrying message took the branch above.
            throw new Error("video part must go through the escape hatch");
        }
      }),
    };
  });
}

// The OpenAI chat-completions content array, built by hand for the one case the
// SDK converter can't express. Mirrors what the provider emits for text/image/
// audio so a mixed message (an album with a clip in it) still looks identical.
function toOpenAIContent(parts: AIUserContentPart[]): JSONValue[] {
  return parts.map((part) => {
    switch (part.type) {
      case "text":
        return { type: "text", text: part.text };
      case "image":
        return {
          type: "image_url",
          image_url: { url: dataUrl(part.mediaType, part.image) },
        };
      case "audio":
        return {
          type: "input_audio",
          input_audio: {
            data: Buffer.from(part.audio).toString("base64"),
            format: part.mediaType === "audio/wav" ? "wav" : "mp3",
          },
        };
      case "video":
        return {
          type: "video_url",
          video_url: { url: dataUrl(part.mediaType, part.video) },
        };
    }
  });
}

function dataUrl(mediaType: string, bytes: Uint8Array): string {
  return `data:${mediaType};base64,${Buffer.from(bytes).toString("base64")}`;
}
