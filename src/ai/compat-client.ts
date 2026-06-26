// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import {
  generateText,
  tool as aiTool,
  stepCountIs,
  type ModelMessage,
  type ToolSet,
} from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { AIClient, AIMessage, AskResult } from "./types";
import type { Tool, ToolCallContext } from "./tools/registry";
import type { ReasoningEffort } from "../shared/types";
import type { PriceLookup } from "./model-catalog";
import { proxiedFetch } from "../proxy";
import { aiRequestDurationSeconds, aiRequestsTotal } from "../metrics";

// The provider name doubles as the `providerOptions` key the SDK reads chat
// options under (it matches the segment before the first "."), so
// `providerOptions: { [PROVIDER_NAME]: { reasoningEffort } }` lands in the
// request body as the standard `reasoning_effort` field.
const PROVIDER_NAME = "compat";

type CompatProvider = ReturnType<typeof createOpenAICompatible>;

// AI client for any OpenAI-compatible chat-completions endpoint. Only `models[0]`
// is sent — a generic endpoint has no server-side fallback chain — and the
// per-request USD cost is computed locally from the catalogue's pricing.
export class OpenAICompatClient implements AIClient {
  private readonly provider: CompatProvider;

  constructor(
    baseURL: string,
    apiKey: string,
    private readonly pricing: PriceLookup,
  ) {
    this.provider = createOpenAICompatible({
      name: PROVIDER_NAME,
      baseURL,
      apiKey,
      fetch: proxiedFetch,
    });
  }

  async ask(opts: {
    models: string[];
    system: string;
    messages: AIMessage[];
    tools: Tool[];
    reasoningEffort?: ReasoningEffort | null;
    toolCallContext: ToolCallContext;
  }): Promise<AskResult> {
    const [primary] = opts.models;
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

    const providerOptions = opts.reasoningEffort
      ? { [PROVIDER_NAME]: { reasoningEffort: opts.reasoningEffort } }
      : undefined;

    const start = performance.now();
    let outcome: "success" | "error" = "success";
    try {
      const result = await generateText({
        model: this.provider(primary),
        system: opts.system,
        messages: toModelMessages(opts.messages),
        tools: Object.keys(toolMap).length > 0 ? toolMap : undefined,
        stopWhen: stepCountIs(8),
        providerOptions,
      });

      return {
        text: result.text,
        totalTokens: result.totalUsage.totalTokens ?? 0,
        costUsd: computeCostUsd(
          this.pricing,
          primary,
          result.totalUsage.inputTokens ?? 0,
          result.totalUsage.outputTokens ?? 0,
        ),
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
