// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { z } from "zod";
import type { Lang } from "../../shared/i18n";
import type { AIMessage } from "../types";

export type ToolCallSource = "ask" | "guest";

export type ToolEffect =
  | { type: "reminder_scheduled"; fireAtMs: number; timezone: string }
  | { type: "reminder_updated"; fireAtMs: number; timezone: string }
  | { type: "reminder_cancelled"; fireAtMs: number; timezone: string };

export type ToolCallContext = {
  source: ToolCallSource;
  chatId: string;
  userId: string;
  // Scope token of the bot this turn is running under: omitted/`null` for the
  // main bot, the managed bot's id otherwise. Tools that persist per-character
  // data (reminders, user facts) scope their writes with
  // `storage.forBot(botId ?? null)` — this is the only place that identity is
  // threaded into the tool layer, since the registry hands every tool the
  // shared base storage.
  botId?: string | null;
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
