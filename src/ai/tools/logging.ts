// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import {
  emitLog,
  type LogFields,
  type LogFormat,
  type LogLevel,
} from "../../log";
import {
  toolCallDurationSeconds,
  toolCallsTotal,
} from "../../metrics";
import type { Tool } from "./registry";

export function withLogging<TIn, TOut>(
  tool: Tool<TIn, TOut>,
  format: LogFormat,
): Tool<TIn, TOut> {
  return {
    ...tool,
    execute: async (input, ctx) => {
      const start = Date.now();
      emit(format, "info", "tool_call", {
        tool: tool.name,
        input: capLogValue(input),
        source: ctx.source,
        chat_id: ctx.chatId,
        user_id: ctx.userId,
      });
      let outcome: "ok" | "error" = "ok";
      try {
        const result = await tool.execute(input, ctx);
        emit(format, "info", "tool_result", {
          tool: tool.name,
          result: capLogValue(result),
          duration_ms: Date.now() - start,
        });
        return result;
      } catch (err) {
        outcome = "error";
        emit(format, "error", "tool_error", {
          tool: tool.name,
          // Cap like input/result: an error message can embed a large upstream
          // response body (e.g. firecrawlScrape echoes the HTTP body), which
          // would otherwise blow the log line past the bound this module exists
          // to enforce.
          error: capString(err instanceof Error ? err.message : String(err)),
          duration_ms: Date.now() - start,
        });
        throw err;
      } finally {
        const seconds = (Date.now() - start) / 1000;
        toolCallsTotal.inc({ tool: tool.name, outcome });
        toolCallDurationSeconds.observe({ tool: tool.name }, seconds);
      }
    },
  };
}

function emit(
  format: LogFormat,
  level: LogLevel,
  msg: string,
  fields: LogFields,
): void {
  emitLog({ level, msg, fields }, format);
}

// Largest free-form log field we allow before truncating. The `tool_call`
// input and `tool_result` result can be huge (e.g. youtube_transcript ~50k
// chars, list_facts ~25k chars) and in JSON mode log.ts does NOT cap field
// sizes, so a single call would emit one enormous log line that breaks
// downstream log-shipping (and bulk-echoes durable PII). Cap here so the
// problem is bounded regardless of LOG_FORMAT.
export const LOG_VALUE_MAX = 2048;

// Produce a bounded representation of a free-form field value. Strings longer
// than LOG_VALUE_MAX (and objects/arrays whose JSON serialization exceeds it)
// are truncated with an indicator and the original length. Small values pass
// through UNCHANGED so the existing log shape is preserved.
export function capLogValue(value: unknown): unknown {
  if (typeof value === "string") {
    return capString(value);
  }
  // null and scalars (number/boolean/undefined/bigint/symbol) are small and
  // pass through unchanged.
  if (value === null || typeof value !== "object") {
    return value;
  }
  // Arrays/objects: only pay the stringify cost to decide whether to truncate.
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    // Non-serializable (circular, etc.) — leave it to the formatter.
    return value;
  }
  if (serialized === undefined || serialized.length <= LOG_VALUE_MAX) {
    return value;
  }
  return capString(serialized);
}

function capString(s: string): string {
  if (s.length <= LOG_VALUE_MAX) return s;
  let head = s.slice(0, LOG_VALUE_MAX);
  // A slice can split a surrogate pair, leaving a trailing lone high surrogate;
  // drop it so the truncated value stays well-formed UTF-16.
  const last = head.charCodeAt(head.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) head = head.slice(0, -1);
  return `${head}… (${s.length} chars total)`;
}
