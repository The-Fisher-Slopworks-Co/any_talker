// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { calculatorTool, evaluate, formatNumber } from "./calculator";
import type { ToolCallContext } from "./registry";

const ctx: ToolCallContext = {
  source: "ask",
  chatId: "c",
  userId: "u",
  replyToMessageId: 1,
  timezone: "UTC",
  lang: "en",
  now: 0,
};

const run = (expression: string) =>
  calculatorTool.execute({ expression }, ctx) as string | Promise<string>;

describe("calculator tool — basic arithmetic", () => {
  test("addition and subtraction", async () => {
    expect(await run("1+2")).toBe("3");
    expect(await run("10 - 3 - 2")).toBe("5");
  });

  test("precedence: 1 + 2 * 3 = 7", async () => {
    expect(await run("1+2*3")).toBe("7");
  });

  test("parentheses override precedence: (1+2)*3 = 9", async () => {
    expect(await run("(1+2)*3")).toBe("9");
  });

  test("integer division produces a decimal", async () => {
    expect(await run("1/4")).toBe("0.25");
  });

  test("modulo", async () => {
    expect(await run("10 % 3")).toBe("1");
  });

  test("** is an alias for ^", async () => {
    expect(await run("2 ** 10")).toBe("1024");
  });
});

describe("calculator tool — power & unary minus", () => {
  test("power is right-associative: 2^3^2 = 512", async () => {
    expect(await run("2^3^2")).toBe("512");
  });

  test("-2^2 = -4 (^ binds tighter than unary minus)", async () => {
    expect(await run("-2^2")).toBe("-4");
  });

  test("(-2)^2 = 4", async () => {
    expect(await run("(-2)^2")).toBe("4");
  });

  test("unary plus is a no-op", async () => {
    expect(await run("+3 + +4")).toBe("7");
  });

  test("double unary minus", async () => {
    expect(await run("--5")).toBe("5");
  });

  test("multiplication by negative", async () => {
    expect(await run("2 * -3")).toBe("-6");
  });
});

describe("calculator tool — functions & constants", () => {
  test("sqrt(16) = 4", async () => {
    expect(await run("sqrt(16)")).toBe("4");
  });

  test("sin(pi/2) ≈ 1", async () => {
    const r = Number(await run("sin(pi/2)"));
    expect(r).toBeCloseTo(1, 12);
  });

  test("cos(0) = 1", async () => {
    expect(await run("cos(0)")).toBe("1");
  });

  test("abs/floor/ceil/round", async () => {
    expect(await run("abs(-3.5)")).toBe("3.5");
    expect(await run("floor(3.7)")).toBe("3");
    expect(await run("ceil(3.2)")).toBe("4");
    expect(await run("round(3.5)")).toBe("4");
  });

  test("log/ln are natural log; log10 and log2 too", async () => {
    expect(Number(await run("ln(e)"))).toBeCloseTo(1, 12);
    expect(Number(await run("log(e)"))).toBeCloseTo(1, 12);
    expect(await run("log10(1000)")).toBe("3");
    expect(await run("log2(8)")).toBe("3");
  });

  test("exp(1) = e", async () => {
    expect(Number(await run("exp(1)"))).toBeCloseTo(Math.E, 12);
  });

  test("constants pi and e are recognised", async () => {
    expect(Number(await run("pi"))).toBeCloseTo(Math.PI, 12);
    expect(Number(await run("e"))).toBeCloseTo(Math.E, 12);
  });

  test("function names and constants are case-insensitive", async () => {
    expect(await run("SQRT(16)")).toBe("4");
    expect(await run("Max(1, 2, 3)")).toBe("3");
    expect(Number(await run("PI"))).toBeCloseTo(Math.PI, 12);
  });
});

describe("calculator tool — variadic functions", () => {
  test("max(1,2,3) = 3", async () => {
    expect(await run("max(1,2,3)")).toBe("3");
  });

  test("min(5, 2, 9, -1) = -1", async () => {
    expect(await run("min(5, 2, 9, -1)")).toBe("-1");
  });

  test("min with a single argument", async () => {
    expect(await run("min(42)")).toBe("42");
  });

  test("nested calls and expressions inside args", async () => {
    expect(await run("max(1+2, 2*2, sqrt(9))")).toBe("4");
  });

  test("min()/max() with no args throws", () => {
    expect(() => evaluate("min()")).toThrow(/at least one argument/);
  });
});

describe("calculator tool — numbers", () => {
  test("scientific notation", async () => {
    expect(await run("1.5e2")).toBe("150");
    expect(await run("2e-3")).toBe("0.002");
    expect(await run("1E10")).toBe("10000000000");
  });

  test("leading-dot decimal", async () => {
    expect(await run(".5 + .25")).toBe("0.75");
  });

  test("malformed exponent fails", () => {
    expect(() => evaluate("1e")).toThrow(/parse error/i);
  });
});

describe("calculator tool — whitespace", () => {
  test("tolerates spaces, tabs, newlines", async () => {
    expect(await run("  1  +\t2\n*\n3  ")).toBe("7");
  });

  test("empty / whitespace-only input fails", () => {
    // Empty string is rejected by zod (min(1)); whitespace-only goes to the
    // parser, which fails on EOF.
    expect(calculatorTool.parameters.safeParse({ expression: "" }).success).toBe(false);
    expect(() => evaluate("   ")).toThrow(/parse error/i);
  });
});

describe("calculator tool — errors", () => {
  test("unexpected token: trailing ')'", () => {
    expect(() => evaluate("1+2)")).toThrow(/parse error/i);
  });

  test("mismatched parens: missing ')'", () => {
    expect(() => evaluate("(1+2")).toThrow(/parse error/i);
  });

  test("unknown identifier", () => {
    expect(() => evaluate("foo + 1")).toThrow(/unknown identifier/i);
  });

  test("unknown function", () => {
    expect(() => evaluate("foo(1)")).toThrow(/unknown function/i);
  });

  test("division by zero throws", () => {
    expect(() => evaluate("1/0")).toThrow(/division by zero/i);
    expect(() => evaluate("5 / (2 - 2)")).toThrow(/division by zero/i);
  });

  test("modulo by zero throws", () => {
    expect(() => evaluate("5 % 0")).toThrow(/modulo by zero/i);
  });

  test("illegal character rejected up front", () => {
    expect(() => evaluate("1 + 2; drop table")).toThrow(/illegal character/i);
    expect(() => evaluate("$1 + 2")).toThrow(/illegal character/i);
  });

  test("function arity mismatch", () => {
    expect(() => evaluate("sqrt(1, 2)")).toThrow(/expects 1 argument/i);
    expect(() => evaluate("sqrt()")).toThrow(/expects 1 argument/i);
  });

  test("result NaN throws (e.g. sqrt(-1))", () => {
    // NaN/Infinity slip through bare evaluate() but are caught when the tool
    // formats the result for the model — that's what the model actually sees.
    expect(() => formatNumber(evaluate("sqrt(-1)"))).toThrow(/NaN/);
    expect(() => calculatorTool.execute({ expression: "sqrt(-1)" }, ctx)).toThrow(/NaN/);
  });

  test("infinite result throws (e.g. 1e308 * 1e308)", () => {
    expect(() => formatNumber(evaluate("1e308 * 1e308"))).toThrow(/infinite/);
    expect(() => calculatorTool.execute({ expression: "1e308 * 1e308" }, ctx)).toThrow(/infinite/);
  });
});

describe("calculator tool — formatting", () => {
  test("integer-valued results have no decimal point", () => {
    expect(formatNumber(7)).toBe("7");
    expect(formatNumber(-0)).toBe("0");
    expect(formatNumber(1e10)).toBe("10000000000");
  });

  test("non-integer keeps full precision", () => {
    expect(formatNumber(0.1 + 0.2)).toBe(String(0.1 + 0.2));
  });
});

describe("calculator tool — schema", () => {
  test("expression > 500 chars is rejected", () => {
    const huge = "1+" + "1+".repeat(300) + "1"; // ~600 chars
    expect(
      calculatorTool.parameters.safeParse({ expression: huge }).success,
    ).toBe(false);
  });
});
