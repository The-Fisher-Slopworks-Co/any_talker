// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { describe, expect, test } from "bun:test";
import {
  append,
  emptyTranscript,
  transcript,
  type Transcript,
} from "./transcript";
import type { AIMessage } from "./types";

const q1: AIMessage = { role: "user", content: "Q1" };
const a1: AIMessage = { role: "assistant", content: "A1" };
const q2: AIMessage = { role: "user", content: "Q2" };

describe("Transcript", () => {
  test("append keeps the history as an exact prefix and leaves it untouched", () => {
    const history = transcript([q1, a1]);
    const next = append(history, q2);
    expect([...next]).toEqual([q1, a1, q2]);
    // The very same message objects, not copies: nothing already sent changes.
    expect(next[0]).toBe(history[0]!);
    expect(next[1]).toBe(history[1]!);
    expect([...history]).toEqual([q1, a1]);
  });

  test("empty is empty, and appending to it starts a transcript", () => {
    expect(emptyTranscript).toHaveLength(0);
    expect([...append(emptyTranscript, q1)]).toEqual([q1]);
  });

  test("the log and its messages are frozen at runtime", () => {
    const t = transcript([
      { role: "user", content: [{ type: "text", text: "look" }] },
    ]);
    expect(Object.isFrozen(t)).toBe(true);
    expect(() => (t as unknown as AIMessage[]).push(q2)).toThrow();
    const m = t[0]!;
    expect(Object.isFrozen(m)).toBe(true);
    if (m.role !== "user" || typeof m.content === "string") {
      throw new Error("expected a multipart user message");
    }
    expect(Object.isFrozen(m.content)).toBe(true);
    expect(Object.isFrozen(m.content[0])).toBe(true);
  });

  test("the type admits no edit of what is already there", () => {
    const t = transcript([q1]);
    const takesTranscript = (x: Transcript) => x.length;
    // Every line below must fail to compile — `bun run typecheck` checks it.
    const typeOnly = () => {
      // @ts-expect-error: a readonly array has no push
      t.push(q2);
      // @ts-expect-error: nor splice
      t.splice(0, 1);
      // @ts-expect-error: nor index writes
      t[0] = q2;
      // @ts-expect-error: a plain array is not a transcript
      takesTranscript([q1]);
    };
    expect(typeof typeOnly).toBe("function");
    expect(takesTranscript(t)).toBe(1);
  });
});
