// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { z } from "zod";
import type { Tool } from "./registry";

const Schema = z.object({
  expression: z.string().min(1).max(500),
});

type Input = z.infer<typeof Schema>;

export const calculatorTool: Tool<Input, string> = {
  name: "calculator",
  description:
    "Evaluate a mathematical expression with full numeric precision. " +
    "Supports + - * / % ^ (or **), unary minus, parentheses, " +
    "functions (sqrt, abs, floor, ceil, round, sin, cos, tan, asin, acos, atan, " +
    "log/ln (natural log), log2, log10, exp, min, max), " +
    "and constants (pi, e). Function names and constants are case-insensitive. " +
    "Use this for any non-trivial arithmetic instead of computing it yourself.",
  parameters: Schema,
  execute: ({ expression }, _ctx) => {
    const value = evaluate(expression);
    return formatNumber(value);
  },
};

// ---------------------------------------------------------------------------
// Public entry points (exported for tests).
// ---------------------------------------------------------------------------

export function evaluate(input: string): number {
  // Reject any character outside the allowed alphabet before we even tokenize,
  // so weird inputs fail fast with a clear message and no `eval`-shaped surface
  // is reachable.
  const ALLOWED = /^[\s0-9a-zA-Z_.+\-*/%^(),]*$/;
  if (!ALLOWED.test(input)) {
    const bad = [...input].find((c) => !/[\s0-9a-zA-Z_.+\-*/%^(),]/.test(c));
    throw new Error(`Calculator parse error: illegal character ${JSON.stringify(bad)}`);
  }
  const tokens = tokenize(input);
  const parser = new Parser(tokens);
  const ast = parser.parseExpression();
  parser.expectEnd();
  return evalNode(ast);
}

export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) {
    if (Number.isNaN(n)) throw new Error("Calculator error: result is NaN");
    throw new Error("Calculator error: result is infinite");
  }
  if (Number.isInteger(n)) {
    // Avoid "-0".
    if (Object.is(n, -0)) return "0";
    return n.toFixed(0);
  }
  // Full JS precision; String() already uses the shortest round-trippable form.
  return String(n);
}

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

type TokenType =
  | "num"
  | "ident"
  | "op"
  | "lparen"
  | "rparen"
  | "comma"
  | "eof";

type Token = {
  type: TokenType;
  value: string;
  pos: number;
};

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    if (c === " " || c === "\t" || c === "\n" || c === "\r") {
      i++;
      continue;
    }
    if (c === "(") {
      tokens.push({ type: "lparen", value: c, pos: i });
      i++;
      continue;
    }
    if (c === ")") {
      tokens.push({ type: "rparen", value: c, pos: i });
      i++;
      continue;
    }
    if (c === ",") {
      tokens.push({ type: "comma", value: c, pos: i });
      i++;
      continue;
    }
    // `**` -> ^
    if (c === "*" && src[i + 1] === "*") {
      tokens.push({ type: "op", value: "^", pos: i });
      i += 2;
      continue;
    }
    if ("+-*/%^".includes(c)) {
      tokens.push({ type: "op", value: c, pos: i });
      i++;
      continue;
    }
    if (isDigit(c) || (c === "." && isDigit(src[i + 1] ?? ""))) {
      const start = i;
      // integer / fractional part
      while (i < src.length && isDigit(src[i]!)) i++;
      if (src[i] === ".") {
        i++;
        while (i < src.length && isDigit(src[i]!)) i++;
      }
      // exponent
      if (src[i] === "e" || src[i] === "E") {
        const expStart = i;
        i++;
        if (src[i] === "+" || src[i] === "-") i++;
        if (!isDigit(src[i] ?? "")) {
          throw new Error(
            `Calculator parse error: malformed number at position ${expStart}`,
          );
        }
        while (i < src.length && isDigit(src[i]!)) i++;
      }
      const raw = src.slice(start, i);
      // Reject something like "1.2.3" which the loop above already wouldn't
      // produce, but be defensive.
      if (!/^(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(raw)) {
        throw new Error(`Calculator parse error: malformed number ${JSON.stringify(raw)}`);
      }
      tokens.push({ type: "num", value: raw, pos: start });
      continue;
    }
    if (isIdentStart(c)) {
      const start = i;
      while (i < src.length && isIdentCont(src[i]!)) i++;
      // Lowercase here so the parser/evaluator can treat identifiers as
      // case-insensitive without worrying about it everywhere.
      tokens.push({ type: "ident", value: src.slice(start, i).toLowerCase(), pos: start });
      continue;
    }
    // Should be unreachable thanks to the ALLOWED regex, but keep the safety
    // net so any future tokenizer gap surfaces clearly.
    throw new Error(`Calculator parse error: unexpected character ${JSON.stringify(c)} at position ${i}`);
  }
  tokens.push({ type: "eof", value: "", pos: src.length });
  return tokens;
}

function isDigit(c: string): boolean {
  return c >= "0" && c <= "9";
}
function isIdentStart(c: string): boolean {
  return (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || c === "_";
}
function isIdentCont(c: string): boolean {
  return isIdentStart(c) || isDigit(c);
}

// ---------------------------------------------------------------------------
// Parser (recursive descent) — builds a tiny AST.
//
// Precedence (low to high):
//   expr   = term (('+'|'-') term)*
//   term   = unary (('*'|'/'|'%') unary)*
//   unary  = '-' unary | '+' unary | power
//   power  = primary ('^' unary)?     // right-associative; '^' binds tighter
//                                     // than unary minus, so -2^2 == -4
//   primary= NUM
//          | IDENT '(' args? ')'
//          | IDENT                    // constant
//          | '(' expr ')'
//
// Note that '*', '/', '%' bind to `unary` (not `power`) so that things like
// `2 * -3` parse correctly while still keeping `^` highest.
// ---------------------------------------------------------------------------

type Node =
  | { kind: "num"; value: number }
  | { kind: "const"; name: string }
  | { kind: "neg"; operand: Node }
  | { kind: "bin"; op: "+" | "-" | "*" | "/" | "%" | "^"; lhs: Node; rhs: Node }
  | { kind: "call"; name: string; args: Node[] };

class Parser {
  private pos = 0;

  constructor(private readonly tokens: Token[]) {}

  private peek(): Token {
    return this.tokens[this.pos]!;
  }
  private advance(): Token {
    return this.tokens[this.pos++]!;
  }
  private match(type: TokenType, value?: string): boolean {
    const t = this.peek();
    if (t.type !== type) return false;
    if (value !== undefined && t.value !== value) return false;
    this.pos++;
    return true;
  }
  private expect(type: TokenType, value?: string): Token {
    const t = this.peek();
    if (t.type !== type || (value !== undefined && t.value !== value)) {
      throw new Error(
        `Calculator parse error: expected ${value ?? type}, got ${describeToken(t)}`,
      );
    }
    this.pos++;
    return t;
  }

  expectEnd(): void {
    const t = this.peek();
    if (t.type !== "eof") {
      throw new Error(`Calculator parse error: unexpected ${describeToken(t)}`);
    }
  }

  parseExpression(): Node {
    let lhs = this.parseTerm();
    while (this.peek().type === "op" && (this.peek().value === "+" || this.peek().value === "-")) {
      const op = this.advance().value as "+" | "-";
      const rhs = this.parseTerm();
      lhs = { kind: "bin", op, lhs, rhs };
    }
    return lhs;
  }

  private parseTerm(): Node {
    let lhs = this.parseUnary();
    while (
      this.peek().type === "op" &&
      (this.peek().value === "*" || this.peek().value === "/" || this.peek().value === "%")
    ) {
      const op = this.advance().value as "*" | "/" | "%";
      const rhs = this.parseUnary();
      lhs = { kind: "bin", op, lhs, rhs };
    }
    return lhs;
  }

  private parseUnary(): Node {
    if (this.peek().type === "op" && this.peek().value === "-") {
      this.advance();
      return { kind: "neg", operand: this.parseUnary() };
    }
    if (this.peek().type === "op" && this.peek().value === "+") {
      this.advance();
      return this.parseUnary();
    }
    return this.parsePower();
  }

  private parsePower(): Node {
    const base = this.parsePrimary();
    if (this.peek().type === "op" && this.peek().value === "^") {
      this.advance();
      // Right-assoc: exponent parses as another unary (which itself recurses
      // into power), giving 2^3^2 = 2^(3^2) = 512.
      const exp = this.parseUnary();
      return { kind: "bin", op: "^", lhs: base, rhs: exp };
    }
    return base;
  }

  private parsePrimary(): Node {
    const t = this.peek();
    if (t.type === "num") {
      this.advance();
      return { kind: "num", value: Number(t.value) };
    }
    if (t.type === "ident") {
      this.advance();
      if (this.match("lparen")) {
        const args: Node[] = [];
        if (this.peek().type !== "rparen") {
          args.push(this.parseExpression());
          while (this.match("comma")) {
            args.push(this.parseExpression());
          }
        }
        this.expect("rparen");
        return { kind: "call", name: t.value, args };
      }
      return { kind: "const", name: t.value };
    }
    if (t.type === "lparen") {
      this.advance();
      const inner = this.parseExpression();
      this.expect("rparen");
      return inner;
    }
    throw new Error(`Calculator parse error: unexpected ${describeToken(t)}`);
  }
}

function describeToken(t: Token): string {
  if (t.type === "eof") return "end of input";
  return `token ${JSON.stringify(t.value)}`;
}

// ---------------------------------------------------------------------------
// Evaluator
// ---------------------------------------------------------------------------

const CONSTANTS: Record<string, number> = {
  pi: Math.PI,
  e: Math.E,
};

type Fn =
  | { arity: 1; fn: (x: number) => number }
  | { arity: "variadic"; fn: (xs: number[]) => number };

const FUNCTIONS: Record<string, Fn> = {
  sqrt: { arity: 1, fn: Math.sqrt },
  abs: { arity: 1, fn: Math.abs },
  floor: { arity: 1, fn: Math.floor },
  ceil: { arity: 1, fn: Math.ceil },
  round: { arity: 1, fn: Math.round },
  sin: { arity: 1, fn: Math.sin },
  cos: { arity: 1, fn: Math.cos },
  tan: { arity: 1, fn: Math.tan },
  asin: { arity: 1, fn: Math.asin },
  acos: { arity: 1, fn: Math.acos },
  atan: { arity: 1, fn: Math.atan },
  // log/ln are both the natural logarithm — matches what most calculator UIs
  // do when "log" appears alongside log10.
  log: { arity: 1, fn: Math.log },
  ln: { arity: 1, fn: Math.log },
  log2: { arity: 1, fn: Math.log2 },
  log10: { arity: 1, fn: Math.log10 },
  exp: { arity: 1, fn: Math.exp },
  min: { arity: "variadic", fn: (xs) => Math.min(...xs) },
  max: { arity: "variadic", fn: (xs) => Math.max(...xs) },
};

function evalNode(node: Node): number {
  switch (node.kind) {
    case "num":
      return node.value;
    case "const": {
      const v = CONSTANTS[node.name];
      if (v === undefined) {
        throw new Error(`Calculator error: unknown identifier ${JSON.stringify(node.name)}`);
      }
      return v;
    }
    case "neg":
      return -evalNode(node.operand);
    case "bin": {
      const a = evalNode(node.lhs);
      const b = evalNode(node.rhs);
      switch (node.op) {
        case "+":
          return a + b;
        case "-":
          return a - b;
        case "*":
          return a * b;
        case "/":
          if (b === 0) throw new Error("Calculator error: division by zero");
          return a / b;
        case "%":
          if (b === 0) throw new Error("Calculator error: modulo by zero");
          return a % b;
        case "^":
          return Math.pow(a, b);
      }
      // Unreachable.
      throw new Error(`Calculator error: unknown operator ${node.op}`);
    }
    case "call": {
      const fn = FUNCTIONS[node.name];
      if (!fn) {
        throw new Error(`Calculator error: unknown function ${JSON.stringify(node.name)}`);
      }
      const args = node.args.map(evalNode);
      if (fn.arity === "variadic") {
        if (args.length === 0) {
          throw new Error(`Calculator error: ${node.name}() requires at least one argument`);
        }
        return fn.fn(args);
      }
      if (args.length !== fn.arity) {
        throw new Error(
          `Calculator error: ${node.name}() expects ${fn.arity} argument(s), got ${args.length}`,
        );
      }
      return fn.fn(args[0]!);
    }
  }
}
