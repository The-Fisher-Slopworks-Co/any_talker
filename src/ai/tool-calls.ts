// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { ToolCallRecord } from "../shared/types";

// Ceiling on a stored tool result. A result can be enormous (`fetch_page`
// returns a whole page, `youtube_transcript` ~50k chars), every node is written
// twice under a 30-day TTL, and each one is replayed into every later prompt in
// the chain — so an uncapped result would bloat both storage and the cost of
// each follow-up. 4096 chars (~1k tokens) keeps a fetched page's substance.
export const TOOL_OUTPUT_MAX = 4096;

// Ceiling on how many calls one turn contributes. `MAX_TOOL_ROUNDS` allows 7
// rounds, each of which may fire several tools at once, so a pathological turn
// could otherwise store dozens of pairs. The early calls fetched the material
// the answer was built on, so the tail is what gets dropped.
export const TOOL_CALLS_MAX_PER_TURN = 8;

// The result travels as a JSON string. Cutting the encoded text would hand the
// model a malformed value, so the payload is decoded, cut, and re-encoded — a
// truncated object comes back as a string, which is lossy but never invalid.
export function capToolOutput(output: string): string {
  if (output.length <= TOOL_OUTPUT_MAX) return output;
  let decoded: unknown;
  try {
    decoded = JSON.parse(output);
  } catch {
    decoded = output;
  }
  const text =
    typeof decoded === "string" ? decoded : (JSON.stringify(decoded) ?? output);
  return JSON.stringify(capText(text));
}

function capText(s: string): string {
  if (s.length <= TOOL_OUTPUT_MAX) return s;
  let head = s.slice(0, TOOL_OUTPUT_MAX);
  // A slice can split a surrogate pair, leaving a lone high surrogate; drop it
  // so the stored value stays well-formed UTF-16 (as `tools/logging.ts` does).
  const last = head.charCodeAt(head.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) head = head.slice(0, -1);
  return `${head}… (truncated, ${s.length} chars total)`;
}

// The two item shapes this reads out of the agent's conversation state. Kept
// structural rather than importing the SDK's models: only these fields are
// used, and the union the SDK exposes for state messages is far wider.
type StateItem = {
  type?: unknown;
  callId?: unknown;
  name?: unknown;
  arguments?: unknown;
  output?: unknown;
};

// Pairs each `function_call` in the agent's own conversation state with the
// `function_call_output` that answered it.
//
// The state is the right source rather than a wrapper around each tool's
// `execute`: it carries the provider's real call ids (the execute context does
// not expose them) and the exact serialization the model was handed, including
// the shape a thrown tool's error was folded into.
//
// A call with no matching output is dropped, not stored half-formed: that is a
// call the loop never got to answer (a run cut short mid-round), and replaying
// it alone would make the next request malformed.
//
// `known` carries the call ids this turn REPLAYED from earlier turns. The state
// is the whole conversation, input included, so without it every follow-up
// would re-persist its ancestors' calls onto its own node and the chain would
// grow quadratically.
export function extractToolCalls(
  items: readonly unknown[],
  known: ReadonlySet<string>,
): ToolCallRecord[] {
  const calls: Array<{ callId: string; name: string; arguments: string }> = [];
  const outputs = new Map<string, string>();

  for (const raw of items) {
    if (typeof raw !== "object" || raw === null) continue;
    const item = raw as StateItem;
    if (
      item.type === "function_call" &&
      typeof item.callId === "string" &&
      typeof item.name === "string" &&
      typeof item.arguments === "string"
    ) {
      calls.push({
        callId: item.callId,
        name: item.name,
        arguments: item.arguments,
      });
    } else if (
      item.type === "function_call_output" &&
      typeof item.callId === "string" &&
      typeof item.output === "string"
    ) {
      outputs.set(item.callId, item.output);
    }
  }

  const records: ToolCallRecord[] = [];
  for (const call of calls) {
    if (known.has(call.callId)) continue;
    const output = outputs.get(call.callId);
    if (output === undefined) continue;
    records.push({ ...call, output: capToolOutput(output) });
    if (records.length === TOOL_CALLS_MAX_PER_TURN) break;
  }
  return records;
}
