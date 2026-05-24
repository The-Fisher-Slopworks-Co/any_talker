// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { z } from "zod";
import { LOG_VALUE_MAX, capLogValue, withLogging } from "./logging";
import type { Tool, ToolCallContext } from "./registry";

describe("capLogValue", () => {
  test("passes small strings through unchanged", () => {
    expect(capLogValue("hello")).toBe("hello");
    expect(capLogValue("")).toBe("");
  });

  test("passes scalars and null through unchanged", () => {
    expect(capLogValue(42)).toBe(42);
    expect(capLogValue(true)).toBe(true);
    expect(capLogValue(null)).toBe(null);
    expect(capLogValue(undefined)).toBe(undefined);
  });

  test("passes a string exactly at the cap through unchanged", () => {
    const s = "a".repeat(LOG_VALUE_MAX);
    expect(capLogValue(s)).toBe(s);
  });

  test("truncates a long string with an indicator and original length", () => {
    const total = LOG_VALUE_MAX + 1000;
    const s = "x".repeat(total);
    const capped = capLogValue(s) as string;

    expect(capped).toBe(`${"x".repeat(LOG_VALUE_MAX)}… (${total} chars total)`);
    expect(capped.startsWith("x".repeat(LOG_VALUE_MAX))).toBe(true);
    expect(capped).toContain(`(${total} chars total)`);
    // Bounded: prefix + short, fixed-size indicator.
    expect(capped.length).toBeLessThan(LOG_VALUE_MAX + 64);
  });

  test("passes small objects through unchanged (same reference)", () => {
    const obj = { a: 1, b: "two" };
    expect(capLogValue(obj)).toBe(obj);
    const arr = [1, 2, 3];
    expect(capLogValue(arr)).toBe(arr);
  });

  test("truncates an object whose JSON serialization exceeds the cap", () => {
    const big = { text: "y".repeat(LOG_VALUE_MAX + 500) };
    const capped = capLogValue(big) as string;

    expect(typeof capped).toBe("string");
    const serializedLen = JSON.stringify(big).length;
    expect(capped).toContain(`(${serializedLen} chars total)`);
    expect(capped.length).toBeLessThan(LOG_VALUE_MAX + 64);
  });

  test("truncates a large array via its JSON serialization", () => {
    const arr = Array.from({ length: 5000 }, (_, i) => i);
    const capped = capLogValue(arr) as string;

    expect(typeof capped).toBe("string");
    expect(capped).toContain("chars total)");
  });
});

describe("withLogging", () => {
  const logs: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;

  beforeEach(() => {
    logs.length = 0;
    console.log = (line: string) => {
      logs.push(line);
    };
    console.error = (line: string) => {
      logs.push(line);
    };
  });

  afterEach(() => {
    console.log = originalLog;
    console.error = originalError;
  });

  const ctx: ToolCallContext = {
    source: "ask",
    chatId: "chat-1",
    userId: "user-1",
    replyToMessageId: null,
    timezone: "UTC",
    lang: "en",
    now: 0,
  };

  function makeTool<T>(result: T): Tool<{ q: string }, T> {
    return {
      name: "test_tool",
      description: "a test tool",
      parameters: z.object({ q: z.string() }),
      execute: () => result,
    };
  }

  test("logs a >2048-char string result truncated with a length indicator", async () => {
    const total = LOG_VALUE_MAX + 5000;
    const big = "z".repeat(total);
    const wrapped = withLogging(makeTool(big), "json");

    const out = await wrapped.execute({ q: "hi" }, ctx);
    // The tool itself still returns the full, untruncated value.
    expect(out).toBe(big);

    const resultLine = logs.find((l) => l.includes('"msg":"tool_result"'));
    expect(resultLine).toBeDefined();
    const parsed = JSON.parse(resultLine as string);
    expect(typeof parsed.result).toBe("string");
    expect(parsed.result).toContain(`(${total} chars total)`);
    // The emitted field is bounded, not the full ~7k chars.
    expect((parsed.result as string).length).toBeLessThan(LOG_VALUE_MAX + 64);
  });

  test("logs a >2048-char input truncated in the tool_call line", async () => {
    const total = LOG_VALUE_MAX + 3000;
    const bigArg = "q".repeat(total);
    const wrapped = withLogging(makeTool("ok"), "json");

    await wrapped.execute({ q: bigArg }, ctx);

    const callLine = logs.find((l) => l.includes('"msg":"tool_call"'));
    expect(callLine).toBeDefined();
    const parsed = JSON.parse(callLine as string);
    // The whole input object serialized over the cap, so it becomes a string.
    expect(typeof parsed.input).toBe("string");
    expect(parsed.input).toContain("chars total)");
    expect((parsed.input as string).length).toBeLessThan(LOG_VALUE_MAX + 64);
  });

  test("logs a small string result unchanged", async () => {
    const wrapped = withLogging(makeTool("ok"), "json");
    await wrapped.execute({ q: "hi" }, ctx);

    const resultLine = logs.find((l) => l.includes('"msg":"tool_result"'));
    expect(resultLine).toBeDefined();
    const parsed = JSON.parse(resultLine as string);
    expect(parsed.result).toBe("ok");
  });

  test("logs a small number result unchanged", async () => {
    const wrapped = withLogging(makeTool(123), "json");
    await wrapped.execute({ q: "hi" }, ctx);

    const resultLine = logs.find((l) => l.includes('"msg":"tool_result"'));
    expect(resultLine).toBeDefined();
    const parsed = JSON.parse(resultLine as string);
    expect(parsed.result).toBe(123);
  });

  test("does not cap small scalar metadata fields", async () => {
    const wrapped = withLogging(makeTool("ok"), "json");
    await wrapped.execute({ q: "hi" }, ctx);

    const callLine = logs.find((l) => l.includes('"msg":"tool_call"'));
    expect(callLine).toBeDefined();
    const parsed = JSON.parse(callLine as string);
    expect(parsed.tool).toBe("test_tool");
    expect(parsed.source).toBe("ask");
    expect(parsed.chat_id).toBe("chat-1");
    expect(parsed.user_id).toBe("user-1");
  });
});
