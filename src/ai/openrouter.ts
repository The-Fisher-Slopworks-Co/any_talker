// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import {
  generateText,
  tool as aiTool,
  stepCountIs,
  type ModelMessage,
  type ToolSet,
} from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { AIClient, AIMessage, AskResult } from "./types";
import type { Tool, ToolCallContext } from "./tools/registry";
import type { ProviderSort, ReasoningEffort, ServiceTier } from "../shared/types";
import { proxiedFetch } from "../proxy";
import {
  aiRequestDurationSeconds,
  aiRequestsTotal,
} from "../metrics";

export type OpenRouterAppAttribution = {
  url?: string | undefined;
  title?: string | undefined;
};

export class OpenRouterAIClient implements AIClient {
  private readonly defaultApiKey: string;
  private readonly defaultProvider: ReturnType<typeof createOpenRouter>;
  private readonly attributionHeaders: Record<string, string>;

  constructor(apiKey: string, attribution: OpenRouterAppAttribution = {}) {
    this.defaultApiKey = apiKey;
    this.attributionHeaders = buildAttributionHeaders(attribution);
    this.defaultProvider = createOpenRouter({
      apiKey,
      fetch: proxiedFetch,
      headers: this.attributionHeaders,
    });
  }

  async ask(opts: {
    models: string[];
    system: string;
    messages: AIMessage[];
    tools: Tool[];
    providerSort?: ProviderSort | null;
    serviceTier?: ServiceTier | null;
    reasoningEffort?: ReasoningEffort | null;
    toolCallContext: ToolCallContext;
    apiKey?: string | null;
  }): Promise<AskResult> {
    const [primary, ...fallbacks] = opts.models;
    if (!primary) {
      throw new Error(
        `at least one model id is required (got ${opts.models.length})`,
      );
    }

    const provider =
      opts.apiKey && opts.apiKey !== this.defaultApiKey
        ? createOpenRouter({
            apiKey: opts.apiKey,
            fetch: proxiedFetch,
            headers: this.attributionHeaders,
          })
        : this.defaultProvider;

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

    const openrouterOpts: {
      models?: string[];
      provider?: { sort: ProviderSort };
      service_tier?: ServiceTier;
      reasoning?: { effort: ReasoningEffort };
      usage?: { include: boolean };
    } = {
      // Ask OpenRouter to include usage accounting so each response carries the
      // request's USD cost in providerMetadata.openrouter.usage.cost.
      usage: { include: true },
    };
    if (fallbacks.length > 0) openrouterOpts.models = fallbacks;
    if (opts.providerSort) {
      openrouterOpts.provider = { sort: opts.providerSort };
    }
    // OpenRouter reads `service_tier` as a top-level body field; the provider
    // spreads any providerOptions.openrouter key straight into the request.
    if (opts.serviceTier) {
      openrouterOpts.service_tier = opts.serviceTier;
    }
    if (opts.reasoningEffort) {
      openrouterOpts.reasoning = { effort: opts.reasoningEffort };
    }

    const start = performance.now();
    let outcome: "success" | "error" = "success";
    try {
      const result = await generateText({
        model: provider(primary),
        system: opts.system,
        messages: toModelMessages(opts.messages),
        tools: Object.keys(toolMap).length > 0 ? toolMap : undefined,
        stopWhen: stepCountIs(8),
        providerOptions:
          Object.keys(openrouterOpts).length > 0
            ? { openrouter: openrouterOpts }
            : undefined,
      });

      return {
        text: result.text,
        totalTokens: result.totalUsage.totalTokens ?? 0,
        costUsd: sumStepCostUsd(result.steps),
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

// Maps our domain messages onto the AI SDK's prompt format. Audio parts become
// `file` parts: the OpenRouter provider turns any `file` part with an `audio/*`
// media type into the `input_audio` body field the API expects.
function toModelMessages(messages: AIMessage[]): ModelMessage[] {
  return messages.map((m) => {
    if (m.role === "assistant") return { role: "assistant", content: m.content };
    if (typeof m.content === "string") return { role: "user", content: m.content };
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
        }
      }),
    };
  });
}

// Sums the per-request USD cost OpenRouter reports for each generation step.
// With tool calls a single ask fans out into multiple steps, each its own
// billed request; totalUsage aggregates tokens the same way.
function sumStepCostUsd(
  steps: ReadonlyArray<{ providerMetadata?: Record<string, unknown> }>,
): number {
  let total = 0;
  for (const step of steps) {
    const openrouter = step.providerMetadata?.openrouter as
      | { usage?: { cost?: unknown } }
      | undefined;
    const cost = openrouter?.usage?.cost;
    if (typeof cost === "number" && Number.isFinite(cost)) total += cost;
  }
  return total;
}

function buildAttributionHeaders(
  attr: OpenRouterAppAttribution,
): Record<string, string> {
  const headers: Record<string, string> = {};
  if (attr.url) headers["HTTP-Referer"] = attr.url;
  if (attr.title) headers["X-Title"] = attr.title;
  return headers;
}
