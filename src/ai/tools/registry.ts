// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { z } from "zod";
import type { Lang } from "../../shared/i18n";
import type { AIMessage } from "../types";

export type ToolCallSource = "ask" | "guest";

export type ToolEffect = {
  type: "reminder_scheduled";
  fireAtMs: number;
  timezone: string;
};

export type ToolCallContext = {
  source: ToolCallSource;
  chatId: string;
  userId: string;
  replyToMessageId: number | null;
  timezone: string;
  lang: Lang;
  now: number;
  effects?: ToolEffect[];
  // Snapshot of the messages passed to ai.ask() for the turn this tool
  // call is running inside. Tools that need to durably capture the
  // conversation context (e.g. reminders) read this.
  contextMessages?: AIMessage[];
};

export type Tool<TInput = unknown, TOutput = unknown> = {
  name: string;
  description: string;
  parameters: z.ZodType<TInput>;
  execute: (input: TInput, ctx: ToolCallContext) => Promise<TOutput> | TOutput;
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
