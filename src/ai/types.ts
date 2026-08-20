// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { Tool, ToolCallContext } from "./tools/registry";
import type {
  ProviderSort,
  ReasoningEffort,
  ServiceTier,
  ToolCallRecord,
} from "../shared/types";

// Where the request should be routed and on what tier, as resolved from the
// effective settings. Always sent; OpenRouter honours them.
export type RoutingOptions = {
  providerSort?: ProviderSort | null;
  provider?: string | null;
  serviceTier?: ServiceTier | null;
};

export type AIUserContentPart =
  | { type: "text"; text: string }
  | { type: "image"; image: Uint8Array; mediaType: string }
  | { type: "audio"; audio: Uint8Array; mediaType: string }
  // A whole clip, sent as-is. Only produced for a model that advertises `video`
  // input (see `ModelCatalog.supportsVideoInput`); everything else gets sampled
  // frames as ordinary image parts instead.
  | { type: "video"; video: Uint8Array; mediaType: string };

export type AIMessage =
  | { role: "user"; content: string | AIUserContentPart[] }
  | { role: "assistant"; content: string }
  // One tool call from an earlier turn, replayed as the provider's own pair of
  // items (`responses-input.ts` expands it into `function_call` +
  // `function_call_output`). Call and result travel together so a replay can
  // never emit a call the request has no result for.
  | ToolCallRecord & { role: "tool" };

// The stored form (reminder context snapshots). Deliberately has no video
// variant: a whole clip is up to 20 MB, and base64'ing that into a reminder
// record — which has no TTL and is re-sent verbatim at delivery — is not a
// trade worth making. `serializeMessages` swaps a clip for a text marker.
export type SerializedAIUserContentPart =
  | { type: "text"; text: string }
  | { type: "image"; image_base64: string; mediaType: string }
  | { type: "audio"; audio_base64: string; mediaType: string };

export type SerializedAIMessage =
  | { role: "user"; content: string | SerializedAIUserContentPart[] }
  | { role: "assistant"; content: string }
  // Already four plain strings, so the stored form is the live one.
  | (ToolCallRecord & { role: "tool" });

export type AskResult = {
  // May be empty — a tool-using run can come back with an empty final turn;
  // callers treat that as an error (`ask.ts`), and the ask is still charged.
  text: string;
  totalTokens: number;
  // The model id spend is attributed to (`models[0]`, not necessarily the model
  // that answered). Optional so fixtures that don't care still type.
  modelId?: string;
  // USD cost OpenRouter reported for the whole tool-calling loop
  // (`SessionEnd.totalUsage.cost`). 0 when it reported none. Optional so
  // fixtures/callers that don't care still type.
  costUsd?: number;
  // False when OpenRouter reported no cost for this ask, so `costUsd` is a
  // floor of $0 and spend is under-counted. Surfaced to the owner so the blind
  // spot is visible. Optional (absent ⇒ treat as priced) for fixtures.
  priced?: boolean;
  // The tool calls this run made — NOT the ones it replayed from earlier turns
  // — in execution order, capped by `TOOL_CALLS_MAX_PER_TURN`. Callers persist
  // them with the turn so the next one can replay them. Optional so fixtures
  // that don't care still type; a client that records nothing is
  // indistinguishable from a run that called no tools, which is the right
  // default.
  toolCalls?: ToolCallRecord[];
};

export interface AIClient {
  ask(opts: {
    models: string[];
    system: string;
    messages: AIMessage[];
    tools: Tool[];
    routing?: RoutingOptions;
    reasoningEffort?: ReasoningEffort | null;
    // Stable id of the conversation this turn belongs to, so OpenRouter routes
    // the session stickily and keeps its prompt cache warm (`ai/session.ts`).
    sessionId?: string | null;
    toolCallContext: ToolCallContext;
  }): Promise<AskResult>;
}
