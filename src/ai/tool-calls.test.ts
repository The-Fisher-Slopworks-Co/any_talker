// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { describe, expect, test } from "bun:test";
import {
  TOOL_CALLS_MAX_PER_TURN,
  TOOL_OUTPUT_MAX,
  capToolOutput,
  extractToolCalls,
} from "./tool-calls";

const call = (callId: string, name = "echo") => ({
  type: "function_call",
  id: `fc_${callId}`,
  callId,
  name,
  arguments: `{"value":"${callId}"}`,
  status: "completed",
});
const output = (callId: string, out = '"ok"') => ({
  type: "function_call_output",
  id: `output_${callId}`,
  callId,
  output: out,
});
const none = new Set<string>();

describe("capToolOutput", () => {
  test("a result within the ceiling is untouched", () => {
    const s = JSON.stringify("x".repeat(100));
    expect(capToolOutput(s)).toBe(s);
  });

  // The model is handed this string; cutting the encoded form would leave it
  // reading a broken value.
  test("an oversized string result stays valid JSON", () => {
    const capped = capToolOutput(JSON.stringify("y".repeat(TOOL_OUTPUT_MAX * 2)));
    const decoded: unknown = JSON.parse(capped);
    expect(typeof decoded).toBe("string");
    expect(decoded as string).toContain(`${TOOL_OUTPUT_MAX * 2} chars total`);
  });

  test("an oversized object result degrades to a truncated JSON string", () => {
    const capped = capToolOutput(
      JSON.stringify({ rows: Array.from({ length: 2000 }, (_, i) => `row ${i}`) }),
    );
    const decoded: unknown = JSON.parse(capped);
    expect(typeof decoded).toBe("string");
    expect(decoded as string).toStartWith('{"rows":["row 0"');
    expect(decoded as string).toContain("chars total");
  });

  test("a cut never leaves a lone surrogate behind", () => {
    const capped = capToolOutput(
      JSON.stringify("a".repeat(TOOL_OUTPUT_MAX - 1) + "😀tail"),
    );
    expect(() => JSON.parse(capped)).not.toThrow();
  });

  // A result that is not JSON at all should still come back as a JSON string
  // rather than propagating something the model cannot read.
  test("a non-JSON result is re-encoded rather than passed through", () => {
    const capped = capToolOutput("not json ".repeat(TOOL_OUTPUT_MAX));
    expect(typeof (JSON.parse(capped) as unknown)).toBe("string");
  });
});

describe("extractToolCalls", () => {
  test("pairs each call with the output that answered it", () => {
    expect(
      extractToolCalls(
        [
          { role: "user", content: "hi" },
          call("call_a", "fetch_page"),
          output("call_a", '"# Page"'),
          { type: "message", role: "assistant" },
        ],
        none,
      ),
    ).toEqual([
      {
        callId: "call_a",
        name: "fetch_page",
        arguments: '{"value":"call_a"}',
        output: '"# Page"',
      },
    ]);
  });

  // Replaying a call the request has no result for is a malformed request, so
  // a half-formed pair must never reach storage in the first place.
  test("a call with no output is dropped", () => {
    expect(extractToolCalls([call("call_a"), call("call_b"), output("call_b")], none))
      .toEqual([
        {
          callId: "call_b",
          name: "echo",
          arguments: '{"value":"call_b"}',
          output: '"ok"',
        },
      ]);
  });

  test("an output with no call is ignored", () => {
    expect(extractToolCalls([output("call_orphan")], none)).toEqual([]);
  });

  // The state is the whole conversation, replayed input included: without this
  // every follow-up would re-harvest its ancestors' calls onto its own node.
  test("calls already known from earlier turns are skipped", () => {
    const records = extractToolCalls(
      [call("call_old"), output("call_old"), call("call_new"), output("call_new")],
      new Set(["call_old"]),
    );
    expect(records.map((r) => r.callId)).toEqual(["call_new"]);
  });

  test("execution order is preserved", () => {
    const records = extractToolCalls(
      [call("c1"), call("c2"), output("c1"), output("c2")],
      none,
    );
    expect(records.map((r) => r.callId)).toEqual(["c1", "c2"]);
  });

  test("the per-turn ceiling bounds what one turn stores", () => {
    const items = [];
    for (let i = 0; i < TOOL_CALLS_MAX_PER_TURN + 5; i++) {
      items.push(call(`c${i}`), output(`c${i}`));
    }
    expect(extractToolCalls(items, none)).toHaveLength(TOOL_CALLS_MAX_PER_TURN);
  });

  test("results are capped on the way in", () => {
    const records = extractToolCalls(
      [call("c1"), output("c1", JSON.stringify("z".repeat(TOOL_OUTPUT_MAX * 2)))],
      none,
    );
    expect(records[0]!.output.length).toBeLessThan(TOOL_OUTPUT_MAX + 200);
  });

  // The state union is wide and the SDK may add item types; anything that is
  // not a well-formed pair is simply not our concern.
  test("malformed and unrelated items are ignored", () => {
    expect(
      extractToolCalls(
        [null, "text", 42, { type: "function_call" }, { type: "reasoning" }],
        none,
      ),
    ).toEqual([]);
  });
});
