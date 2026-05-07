import { generateText, tool as aiTool, stepCountIs, type ToolSet } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { AIClient, AIMessage, AskResult } from "./types";
import type { Tool } from "./tools/registry";

export class OpenRouterAIClient implements AIClient {
  private readonly provider: ReturnType<typeof createOpenRouter>;

  constructor(apiKey: string) {
    this.provider = createOpenRouter({ apiKey });
  }

  async ask(opts: {
    model: string;
    system: string;
    messages: AIMessage[];
    tools: Tool[];
  }): Promise<AskResult> {
    const toolMap: ToolSet = {};
    for (const t of opts.tools) {
      toolMap[t.name] = aiTool({
        description: t.description,
        inputSchema: t.parameters,
        execute: async (input: unknown) => t.execute(input),
      });
    }

    const result = await generateText({
      model: this.provider(opts.model),
      system: opts.system,
      messages: opts.messages,
      tools: Object.keys(toolMap).length > 0 ? toolMap : undefined,
      stopWhen: stepCountIs(5),
    });

    return {
      text: result.text,
      totalTokens: result.totalUsage.totalTokens ?? 0,
    };
  }
}
