// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import {
  formatLog,
  type LogFields,
  type LogFormat,
  type LogLevel,
} from "../../log";
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
        input,
        source: ctx.source,
        chat_id: ctx.chatId,
        user_id: ctx.userId,
      });
      try {
        const result = await tool.execute(input, ctx);
        emit(format, "info", "tool_result", {
          tool: tool.name,
          result,
          duration_ms: Date.now() - start,
        });
        return result;
      } catch (err) {
        emit(format, "error", "tool_error", {
          tool: tool.name,
          error: err instanceof Error ? err.message : String(err),
          duration_ms: Date.now() - start,
        });
        throw err;
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
  const line = formatLog({ level, msg, fields }, format);
  if (level === "error") console.error(line);
  else console.log(line);
}
