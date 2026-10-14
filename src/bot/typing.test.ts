// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { describe, expect, test } from "bun:test";
import type { LogFields } from "../log";
import { createTypingIndicator } from "./typing";

type Line = { msg: string; fields: LogFields };

function setup(send: () => Promise<unknown>) {
  let clock = 1_000;
  const warns: Line[] = [];
  const debugs: Line[] = [];
  const typing = createTypingIndicator({
    send,
    receivedAt: 400,
    fields: { chat_id: 42, bot_id: "7" },
    warn: (msg, fields) => warns.push({ msg, fields }),
    debug: (msg, fields) => debugs.push({ msg, fields }),
    now: () => clock,
    intervalMs: 5,
  });
  return {
    typing,
    warns,
    debugs,
    advance: (ms: number) => {
      clock += ms;
    },
  };
}

const settle = () => new Promise((r) => setTimeout(r, 0));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("createTypingIndicator", () => {
  test("logs how long after the ask typing started and how long it ran", async () => {
    let calls = 0;
    const t = setup(async () => {
      calls++;
    });
    t.typing.start();
    await settle();
    t.advance(2_500);
    t.typing.stop();

    expect(calls).toBe(1);
    expect(t.warns).toEqual([]);
    expect(t.debugs).toEqual([
      {
        msg: "typing_started",
        fields: { chat_id: 42, bot_id: "7", since_received_ms: 600 },
      },
      {
        msg: "typing_stopped",
        fields: {
          chat_id: 42,
          bot_id: "7",
          duration_ms: 2_500,
          first_ack_ms: 0,
          sent: 1,
          failed: 0,
        },
      },
    ]);
  });

  test("warns once with Telegram's error when the action is refused", async () => {
    let calls = 0;
    const t = setup(async () => {
      calls++;
      throw new Error("Call to 'sendChatAction' failed! (403: Forbidden)");
    });
    t.typing.start();
    await wait(20);
    t.typing.stop();

    expect(calls).toBeGreaterThan(1);
    expect(t.warns).toEqual([
      {
        msg: "typing_failed",
        fields: {
          chat_id: 42,
          bot_id: "7",
          since_start_ms: 0,
          error: "Call to 'sendChatAction' failed! (403: Forbidden)",
        },
      },
    ]);
    const stopped = t.debugs.find((l) => l.msg === "typing_stopped");
    expect(stopped?.fields.failed).toBe(calls);
    expect(stopped?.fields.first_ack_ms).toBeNull();
  });

  test("stays silent when the turn never reached the model", () => {
    const t = setup(async () => {});
    t.typing.stop();
    expect(t.debugs).toEqual([]);
    expect(t.warns).toEqual([]);
  });

  test("stops refreshing once stopped", async () => {
    let calls = 0;
    const t = setup(async () => {
      calls++;
    });
    t.typing.start();
    t.typing.stop();
    const after = calls;
    await wait(20);
    expect(calls).toBe(after);
  });
});
