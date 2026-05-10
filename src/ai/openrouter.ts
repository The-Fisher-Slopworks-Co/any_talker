import { generateText, tool as aiTool, stepCountIs, type ToolSet } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { AIClient, AIMessage, AskResult } from "./types";
import type { Tool, ToolCallContext } from "./tools/registry";
import type { ProviderSort } from "../shared/types";
import { formatLog, type LogFormat } from "../log";

export class OpenRouterAIClient implements AIClient {
  private readonly provider: ReturnType<typeof createOpenRouter>;
  private readonly logFormat: LogFormat;

  constructor(apiKey: string, logFormat: LogFormat = "pretty") {
    this.provider = createOpenRouter({ apiKey });
    this.logFormat = logFormat;
  }

  async ask(opts: {
    models: string[];
    system: string;
    messages: AIMessage[];
    tools: Tool[];
    providerSort?: ProviderSort | null;
    toolCallContext: ToolCallContext;
  }): Promise<AskResult> {
    const [primary, ...fallbacks] = opts.models;
    if (!primary) throw new Error("at least one model id is required");

    const toolMap: ToolSet = {};
    for (const t of opts.tools) {
      toolMap[t.name] = aiTool({
        description: t.description,
        inputSchema: t.parameters,
        execute: (input: unknown) =>
          this.runToolWithLogging(t, input, opts.toolCallContext),
      });
    }

    const openrouterOpts: {
      models?: string[];
      provider?: { sort: ProviderSort };
    } = {};
    if (fallbacks.length > 0) openrouterOpts.models = fallbacks;
    if (opts.providerSort) {
      openrouterOpts.provider = { sort: opts.providerSort };
    }

    const result = await generateText({
      model: this.provider(primary),
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
  }

  private async runToolWithLogging(
    t: Tool,
    input: unknown,
    ctx: ToolCallContext,
  ): Promise<unknown> {
    const start = Date.now();
    console.log(
      formatLog(
        {
          level: "info",
          msg: "tool_call",
          fields: {
            tool: t.name,
            input,
            source: ctx.source,
            chat: ctx.chatId,
            user: ctx.userId,
          },
        },
        this.logFormat,
      ),
    );
    try {
      const result = await t.execute(input, ctx);
      console.log(
        formatLog(
          {
            level: "info",
            msg: "tool_result",
            fields: {
              tool: t.name,
              result,
              duration_ms: Date.now() - start,
            },
          },
          this.logFormat,
        ),
      );
      return result;
    } catch (err) {
      console.log(
        formatLog(
          {
            level: "error",
            msg: "tool_error",
            fields: {
              tool: t.name,
              error: err instanceof Error ? err.message : String(err),
              duration_ms: Date.now() - start,
            },
          },
          this.logFormat,
        ),
      );
      throw err;
    }
  }
}
