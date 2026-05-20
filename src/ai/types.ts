// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { Tool, ToolCallContext } from "./tools/registry";
import type { ProviderSort } from "../shared/types";

export type AIUserContentPart =
  | { type: "text"; text: string }
  | { type: "image"; image: Uint8Array; mediaType: string };

export type AIMessage =
  | { role: "user"; content: string | AIUserContentPart[] }
  | { role: "assistant"; content: string };

export type SerializedAIUserContentPart =
  | { type: "text"; text: string }
  | { type: "image"; image_base64: string; mediaType: string };

export type SerializedAIMessage =
  | { role: "user"; content: string | SerializedAIUserContentPart[] }
  | { role: "assistant"; content: string };

export type AskResult = {
  text: string;
  totalTokens: number;
};

export interface AIClient {
  ask(opts: {
    models: string[];
    system: string;
    messages: AIMessage[];
    tools: Tool[];
    providerSort?: ProviderSort | null;
    toolCallContext: ToolCallContext;
    apiKey?: string | null;
  }): Promise<AskResult>;
}
