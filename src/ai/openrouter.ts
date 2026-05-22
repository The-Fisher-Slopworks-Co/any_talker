// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { generateText, tool as aiTool, stepCountIs, type ToolSet } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { AIClient, AIMessage, AskResult } from "./types";
import type { Tool, ToolCallContext } from "./tools/registry";
import type { ProviderSort } from "../shared/types";
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
    } = {};
    if (fallbacks.length > 0) openrouterOpts.models = fallbacks;
    if (opts.providerSort) {
      openrouterOpts.provider = { sort: opts.providerSort };
    }

    const start = performance.now();
    let outcome: "success" | "error" = "success";
    try {
      const result = await generateText({
        model: provider(primary),
        system: opts.system,
        messages: opts.messages,
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

function buildAttributionHeaders(
  attr: OpenRouterAppAttribution,
): Record<string, string> {
  const headers: Record<string, string> = {};
  if (attr.url) headers["HTTP-Referer"] = attr.url;
  if (attr.title) headers["X-Title"] = attr.title;
  return headers;
}
