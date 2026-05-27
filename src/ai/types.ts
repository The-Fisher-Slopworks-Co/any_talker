// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { Tool, ToolCallContext } from "./tools/registry";
import type { ProviderSort, ReasoningEffort, ServiceTier } from "../shared/types";

export type AIUserContentPart =
  | { type: "text"; text: string }
  | { type: "image"; image: Uint8Array; mediaType: string }
  | { type: "audio"; audio: Uint8Array; mediaType: string };

export type AIMessage =
  | { role: "user"; content: string | AIUserContentPart[] }
  | { role: "assistant"; content: string };

export type SerializedAIUserContentPart =
  | { type: "text"; text: string }
  | { type: "image"; image_base64: string; mediaType: string }
  | { type: "audio"; audio_base64: string; mediaType: string };

export type SerializedAIMessage =
  | { role: "user"; content: string | SerializedAIUserContentPart[] }
  | { role: "assistant"; content: string };

export type AskResult = {
  text: string;
  totalTokens: number;
  // USD cost reported by OpenRouter usage accounting, summed across tool-call
  // steps. Optional so existing fixtures/callers that don't care still type.
  costUsd?: number;
};

export interface AIClient {
  ask(opts: {
    models: string[];
    system: string;
    messages: AIMessage[];
    tools: Tool[];
    providerSort?: ProviderSort | null;
    provider?: string | null;
    serviceTier?: ServiceTier | null;
    reasoningEffort?: ReasoningEffort | null;
    toolCallContext: ToolCallContext;
    apiKey?: string | null;
  }): Promise<AskResult>;
}
