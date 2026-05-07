import type { Tool } from "./tools/registry";

export type AIUserContentPart =
  | { type: "text"; text: string }
  | { type: "image"; image: Uint8Array; mediaType: string };

export type AIMessage =
  | { role: "user"; content: string | AIUserContentPart[] }
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
  }): Promise<AskResult>;
}
