// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { z } from "zod";
import type { $ZodObject, $ZodShape } from "zod/v4/core";
import type { Lang } from "../../shared/i18n";
import type { UserSettingChange } from "../../shared/types";
import type { AIMessage } from "../types";

// Where the turn a tool call runs inside came from. `reminder_delivery` is not
// a user request: the turn replays the archived context of the /ask that
// created the reminder and asks the model to word the notification. Tools that
// would act on that replayed request a second time (scheduling above all) are
// kept out of it — see `Tool.sources`.
export type ToolCallSource = "ask" | "guest" | "reminder_delivery";

export type ToolEffect =
  | { type: "reminder_scheduled"; fireAtMs: number; timezone: string }
  | { type: "reminder_updated"; fireAtMs: number; timezone: string }
  | { type: "reminder_cancelled"; fireAtMs: number; timezone: string }
  // One or more of the user's self-service settings (name/timezone/gender/
  // language) were changed by `update_user_settings`; rendered as a confirmation
  // blockquote above the reply, like the reminder effects.
  | { type: "settings_updated"; changes: UserSettingChange[] };

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
  contextMessages?: AIMessage[] | undefined;
};

// A tool's input schema. `@openrouter/agent`'s `tool()` requires a zod v4
// *object* schema; every tool here already uses `z.object(...)` (a `.refine()`d
// object still satisfies the bound), so narrowing costs nothing and keeps
// `execute`'s input typed.
type ToolParameters<TInput> = $ZodObject<$ZodShape> & z.ZodType<TInput>;

export type Tool<TInput = unknown, TOutput = unknown> = {
  name: string;
  description: string;
  parameters: ToolParameters<TInput>;
  execute: (input: TInput, ctx: ToolCallContext) => Promise<TOutput> | TOutput;
  // Sources this tool is offered to; omitted means all of them. A tool opts out
  // of a source when running it there would be wrong regardless of what the
  // model decides — the reminder-writing tools list `ask` and `guest` so a
  // delivery turn cannot re-create the reminders its replayed context asked for.
  sources?: readonly ToolCallSource[];
};

const registry = new Map<string, Tool>();

export function registerTool<TIn, TOut>(tool: Tool<TIn, TOut>): void {
  registry.set(tool.name, tool as Tool);
}

export function getAllTools(source: ToolCallSource): Tool[] {
  return [...registry.values()].filter(
    (tool) => tool.sources === undefined || tool.sources.includes(source),
  );
}

export function _resetRegistryForTest(): void {
  registry.clear();
}
