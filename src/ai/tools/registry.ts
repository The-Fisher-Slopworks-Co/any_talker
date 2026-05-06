import { z } from "zod";

export type Tool<TInput = unknown, TOutput = unknown> = {
  name: string;
  description: string;
  parameters: z.ZodType<TInput>;
  execute: (input: TInput) => Promise<TOutput> | TOutput;
};

const registry = new Map<string, Tool>();

export function registerTool<TIn, TOut>(tool: Tool<TIn, TOut>): void {
  registry.set(tool.name, tool as Tool);
}

export function getAllTools(): Tool[] {
  return [...registry.values()];
}

export function _resetRegistryForTest(): void {
  registry.clear();
}
