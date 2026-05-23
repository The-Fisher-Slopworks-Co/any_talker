// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogFormat = "json" | "pretty";

export type LogFields = Record<string, unknown>;

export type LogRecord = {
  level: LogLevel;
  msg: string;
  fields?: LogFields;
  now?: Date;
};

export function formatLog(record: LogRecord, format: LogFormat): string {
  const ts = (record.now ?? new Date()).toISOString();
  const fields = record.fields ?? {};

  if (format === "json") {
    const obj: Record<string, unknown> = {
      ts,
      level: record.level,
      msg: record.msg,
      ...fields,
    };
    return JSON.stringify(obj);
  }

  const parts = [`[${ts}]`, record.level.toUpperCase(), record.msg];
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined) continue;
    parts.push(`${k}=${renderPrettyValue(v)}`);
  }
  return parts.join(" ");
}

// Cap pretty-rendered field values so a single large object can't produce a
// log line long enough to break downstream log-shipping. JSON mode is left
// uncapped — the JSON envelope is consumed by tools that handle long lines.
const PRETTY_VALUE_MAX = 2048;

function renderPrettyValue(v: unknown): string {
  if (v === null) return "null";
  let rendered: string;
  if (typeof v === "string") {
    rendered = /\s|"/.test(v) ? JSON.stringify(v) : v;
  } else if (typeof v === "number" || typeof v === "boolean") {
    rendered = String(v);
  } else {
    rendered = JSON.stringify(v);
  }
  if (rendered.length <= PRETTY_VALUE_MAX) return rendered;
  return rendered.slice(0, PRETTY_VALUE_MAX) + "…";
}

// Routes `error`/`warn` to stderr (console.error) and the rest to stdout
// (console.log). Downstream Vector reads both as JSON lines, but anyone
// routing stderr separately (or running `bun run … 2>/dev/null` locally)
// will lose warnings — keep that in mind before changing this split.
export function emitLog(record: LogRecord, format: LogFormat): void {
  const line = formatLog(record, format);
  if (record.level === "error" || record.level === "warn") {
    console.error(line);
  } else {
    console.log(line);
  }
}

export function resolveLogFormat(
  env: Record<string, string | undefined>,
): LogFormat {
  const explicit = env.LOG_FORMAT;
  if (explicit !== undefined) {
    if (explicit !== "json" && explicit !== "pretty") {
      throw new Error(
        `LOG_FORMAT must be "json" or "pretty", got: ${explicit}`,
      );
    }
    return explicit;
  }
  return env.NODE_ENV === "production" ? "json" : "pretty";
}
