// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { Fetcher } from "@openrouter/sdk";

// What a BYOK model call really cost on top of OpenRouter's `usage.cost`.
//
// On a BYOK request OpenRouter's `cost` is only its own fee (a few percent, or
// 0 inside the free BYOK allowance); the price the provider charged the key is
// in `cost_details.upstream_inference_cost`, flagged by `is_byok`. On any other
// request `cost` is already the whole price, so nothing is added. Reads the
// wire (snake_case) usage block; anything malformed contributes 0.
export function upstreamCostOf(usage: unknown): number {
  if (typeof usage !== "object" || usage === null) return 0;
  const u = usage as { is_byok?: unknown; cost_details?: unknown };
  if (u.is_byok !== true) return 0;
  if (typeof u.cost_details !== "object" || u.cost_details === null) return 0;
  const cost = (u.cost_details as { upstream_inference_cost?: unknown })
    .upstream_inference_cost;
  return typeof cost === "number" && Number.isFinite(cost) && cost > 0
    ? cost
    : 0;
}

// The Responses stream events that carry the finished response, usage and all.
const TERMINAL_EVENTS = new Set([
  "response.completed",
  "response.incomplete",
  "response.failed",
]);

// A fetcher that reads the upstream (BYOK) cost off every response it passes
// through, plus the total for everything it has seen.
//
// It exists because `@openrouter/agent` drops `is_byok` and `cost_details`
// when it folds a call's usage into `getUsage()`, so the agent's totals cannot
// tell a BYOK call from a free one. Metering at the wire covers every model
// call of the tool loop, whatever the agent re-sends. Meant to be built per
// ask: the total is that ask's alone.
export function meterUpstreamCost(fetch: Fetcher): {
  fetch: Fetcher;
  total: () => Promise<number>;
} {
  const pending: Promise<number>[] = [];

  const metered: Fetcher = async (input, init) => {
    const res = await fetch(input, init);
    if (!res.ok || !res.body) return res;

    const type = res.headers.get("content-type") ?? "";
    if (type.includes("text/event-stream")) {
      // The agent reads one branch; this one is drained for the terminal
      // event. A tee buffers for the slower reader, so nothing is lost.
      const [forAgent, forMeter] = res.body.tee();
      pending.push(readStreamCost(forMeter));
      return new Response(forAgent, {
        status: res.status,
        statusText: res.statusText,
        headers: res.headers,
      });
    }
    if (type.includes("application/json")) {
      pending.push(
        res
          .clone()
          .json()
          .then((body: unknown) =>
            upstreamCostOf((body as { usage?: unknown } | null)?.usage),
          ),
      );
    }
    return res;
  };

  return {
    fetch: metered,
    // Metering is best-effort: a body that fails to parse counts as 0 rather
    // than failing an ask that has already been answered and billed.
    total: async () => {
      const costs = await Promise.allSettled(pending);
      return costs.reduce(
        (sum, c) => sum + (c.status === "fulfilled" ? c.value : 0),
        0,
      );
    },
  };
}

// Drains an SSE body up to its terminal event and returns that response's
// upstream cost. Events are delimited by a blank line; their `data:` lines
// join into one JSON payload.
async function readStreamCost(
  body: ReadableStream<Uint8Array>,
): Promise<number> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return 0;
      buffer += decoder.decode(value, { stream: true }).replace(/\r/g, "");
      let end;
      while ((end = buffer.indexOf("\n\n")) !== -1) {
        const event = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        const data = event
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart())
          .join("\n");
        if (!data || data === "[DONE]") continue;
        let parsed: { type?: unknown; response?: { usage?: unknown } };
        try {
          parsed = JSON.parse(data) as typeof parsed;
        } catch {
          continue;
        }
        if (
          typeof parsed.type === "string" &&
          TERMINAL_EVENTS.has(parsed.type)
        ) {
          return upstreamCostOf(parsed.response?.usage);
        }
      }
    }
  } finally {
    // Stop pulling once the cost is known; the agent's branch is unaffected.
    reader.cancel().catch(() => {});
  }
}
