// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { Tool, ToolCallContext } from "./tools/registry";
import type { ReasoningEffort } from "../shared/types";

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
  // The model id that actually answered (`models[0]`). Lets spend be attributed
  // per model. Optional so fixtures that don't care still type.
  modelId?: string;
  // USD cost computed locally from the catalogue's per-token pricing
  // (inputTokens × promptPrice + outputTokens × completionPrice). Zero when the
  // model has no pricing data. Optional so fixtures/callers that don't care
  // still type.
  costUsd?: number;
  // False when the model had no pricing entry, so `costUsd` is a floor of $0 and
  // real spend is under-counted. Surfaced to the owner so the blind spot is
  // visible. Optional (absent ⇒ treat as priced) for fixtures.
  priced?: boolean;
};

export interface AIClient {
  ask(opts: {
    models: string[];
    system: string;
    messages: AIMessage[];
    tools: Tool[];
    reasoningEffort?: ReasoningEffort | null;
    toolCallContext: ToolCallContext;
  }): Promise<AskResult>;
}
