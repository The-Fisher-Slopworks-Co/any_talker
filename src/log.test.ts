// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { formatLog, resolveLogFormat } from "./log";

describe("formatLog json", () => {
  test("emits one-line JSON with ts, level, msg, fields", () => {
    const line = formatLog(
      {
        level: "info",
        msg: "incoming_update",
        fields: { update_id: 42, type: "message" },
        now: new Date("2026-05-09T12:34:56.789Z"),
      },
      "json",
    );
    expect(line).toBe(
      '{"ts":"2026-05-09T12:34:56.789Z","level":"info","msg":"incoming_update","update_id":42,"type":"message"}',
    );
    expect(line).not.toContain("\n");
  });

  test("supports nested field objects", () => {
    const line = formatLog(
      {
        level: "info",
        msg: "x",
        fields: { chat: { id: 1, type: "private" } },
        now: new Date("2026-01-01T00:00:00.000Z"),
      },
      "json",
    );
    expect(JSON.parse(line)).toEqual({
      ts: "2026-01-01T00:00:00.000Z",
      level: "info",
      msg: "x",
      chat: { id: 1, type: "private" },
    });
  });
});

describe("formatLog pretty", () => {
  test("emits human-readable line with ts/level/msg and key=value fields", () => {
    const line = formatLog(
      {
        level: "info",
        msg: "incoming_update",
        fields: { update_id: 42, type: "message" },
        now: new Date("2026-05-09T12:34:56.789Z"),
      },
      "pretty",
    );
    expect(line).toBe(
      "[2026-05-09T12:34:56.789Z] INFO incoming_update update_id=42 type=message",
    );
  });

  test("renders nested objects as JSON value", () => {
    const line = formatLog(
      {
        level: "info",
        msg: "x",
        fields: { chat: { id: 1, type: "private" } },
        now: new Date("2026-01-01T00:00:00.000Z"),
      },
      "pretty",
    );
    expect(line).toBe(
      '[2026-01-01T00:00:00.000Z] INFO x chat={"id":1,"type":"private"}',
    );
  });

  test("quotes string values containing spaces", () => {
    const line = formatLog(
      {
        level: "warn",
        msg: "y",
        fields: { note: "hello world" },
        now: new Date("2026-01-01T00:00:00.000Z"),
      },
      "pretty",
    );
    expect(line).toBe('[2026-01-01T00:00:00.000Z] WARN y note="hello world"');
  });

  test("omits fields with undefined values", () => {
    const line = formatLog(
      {
        level: "info",
        msg: "x",
        fields: { a: 1, b: undefined, c: "z" },
        now: new Date("2026-01-01T00:00:00.000Z"),
      },
      "pretty",
    );
    expect(line).toBe("[2026-01-01T00:00:00.000Z] INFO x a=1 c=z");
  });
});

describe("resolveLogFormat", () => {
  test("returns explicit LOG_FORMAT when valid", () => {
    expect(resolveLogFormat({ LOG_FORMAT: "json" })).toBe("json");
    expect(resolveLogFormat({ LOG_FORMAT: "pretty" })).toBe("pretty");
  });

  test("rejects invalid LOG_FORMAT values", () => {
    expect(() => resolveLogFormat({ LOG_FORMAT: "yaml" })).toThrow(
      /LOG_FORMAT/,
    );
  });

  test("defaults to json in production", () => {
    expect(resolveLogFormat({ NODE_ENV: "production" })).toBe("json");
  });

  test("defaults to pretty otherwise", () => {
    expect(resolveLogFormat({})).toBe("pretty");
    expect(resolveLogFormat({ NODE_ENV: "development" })).toBe("pretty");
  });
});
