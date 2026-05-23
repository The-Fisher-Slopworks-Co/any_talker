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

function renderPrettyValue(v: unknown): string {
  if (v === null) return "null";
  if (typeof v === "string") {
    return /\s|"/.test(v) ? JSON.stringify(v) : v;
  }
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return JSON.stringify(v);
}

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
