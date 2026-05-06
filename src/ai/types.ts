import type { Tool } from "./tools/registry";

export type AIMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string };

export type AskResult = {
  text: string;
  totalTokens: number;
};

export interface AIClient {
  ask(opts: {
    model: string;
    messages: AIMessage[];
    tools: Tool[];
  }): Promise<AskResult>;
}
