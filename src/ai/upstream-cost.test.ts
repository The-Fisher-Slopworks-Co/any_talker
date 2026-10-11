// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { describe, expect, test } from "bun:test";
import type { Fetcher } from "@openrouter/sdk";
import { meterUpstreamCost, upstreamCostOf } from "./upstream-cost";

const byok = (upstream: unknown) => ({
  cost: 0,
  is_byok: true,
  cost_details: { upstream_inference_cost: upstream },
});

describe("upstreamCostOf", () => {
  test("reads the upstream cost of a BYOK call", () => {
    expect(upstreamCostOf(byok(0.02))).toBe(0.02);
  });

  // Off BYOK, `cost` is already the whole price: adding upstream would
  // double-charge.
  test("ignores the upstream cost of a non-BYOK call", () => {
    expect(
      upstreamCostOf({
        cost: 0.02,
        is_byok: false,
        cost_details: { upstream_inference_cost: 0.02 },
      }),
    ).toBe(0);
    expect(
      upstreamCostOf({
        cost: 0.02,
        cost_details: { upstream_inference_cost: 0.02 },
      }),
    ).toBe(0);
  });

  test("anything malformed contributes nothing", () => {
    for (const bad of [
      undefined,
      null,
      "x",
      { is_byok: true },
      { is_byok: true, cost_details: null },
      byok(null),
      byok("0.02"),
      byok(NaN),
      byok(Infinity),
      byok(-1),
    ]) {
      expect(upstreamCostOf(bad)).toBe(0);
    }
  });
});

const encoder = new TextEncoder();

// An SSE body delivered in the given chunks, split wherever the test likes.
function sse(chunks: string[]): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

const event = (data: unknown) => `data: ${JSON.stringify(data)}\n\n`;

// A fetcher that answers each call with the next response in line.
function replying(...responses: Response[]): Fetcher {
  let i = 0;
  return async () => {
    const res = responses[i++];
    if (!res) throw new Error("no more responses");
    return res;
  };
}

describe("meterUpstreamCost", () => {
  test("reads the terminal event of a stream, chunked anywhere", async () => {
    const stream = [
      ": keep-alive\n\n",
      event({ type: "response.created", response: { usage: null } }),
      event({ type: "response.output_text.delta", delta: "hi" }),
      event({ type: "response.completed", response: { usage: byok(0.02) } }),
    ].join("");
    // Cut mid-line and mid-delimiter: events must be reassembled, not parsed
    // per chunk.
    const meter = meterUpstreamCost(
      replying(
        sse([stream.slice(0, 7), stream.slice(7, 90), stream.slice(90)]),
      ),
    );

    const res = await meter.fetch("https://x/responses");
    // The caller still gets the whole body, untouched.
    expect(await res.text()).toBe(stream);
    expect(await meter.total()).toBe(0.02);
  });

  test("an incomplete response is charged too", async () => {
    const meter = meterUpstreamCost(
      replying(
        sse([
          event({
            type: "response.incomplete",
            response: { usage: byok(0.01) },
          }),
        ]),
      ),
    );
    await (await meter.fetch("https://x")).text();
    expect(await meter.total()).toBe(0.01);
  });

  test("sums every call it saw, streamed or not", async () => {
    const meter = meterUpstreamCost(
      replying(
        sse([
          event({
            type: "response.completed",
            response: { usage: byok(0.02) },
          }),
        ]),
        Response.json({ usage: byok(0.01) }),
        Response.json({ usage: { cost: 0.5 } }),
      ),
    );
    await (await meter.fetch("https://x")).text();
    expect((await (await meter.fetch("https://x")).json()).usage).toEqual(
      byok(0.01),
    );
    await meter.fetch("https://x");
    expect(await meter.total()).toBeCloseTo(0.03, 9);
  });

  // A failed call is not billed, and its body is the caller's to read as an
  // error.
  test("skips a failed response", async () => {
    const meter = meterUpstreamCost(
      replying(Response.json({ usage: byok(0.02) }, { status: 500 })),
    );
    const res = await meter.fetch("https://x");
    expect(res.status).toBe(500);
    expect(await meter.total()).toBe(0);
  });

  test("an unparseable body counts as nothing rather than throwing", async () => {
    const meter = meterUpstreamCost(
      replying(
        new Response("{nope", {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
        sse(["data: {nope\n\n"]),
      ),
    );
    await meter.fetch("https://x");
    await (await meter.fetch("https://x")).text();
    expect(await meter.total()).toBe(0);
  });
});
