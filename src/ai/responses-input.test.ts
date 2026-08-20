// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { describe, expect, test } from "bun:test";
import { dataUrl, toResponsesInput } from "./responses-input";
import type { AIMessage } from "./types";

// The mapper returns the agent's `Item` union, whose assistant variant is the
// full `OutputMessage`. Comparing against plain literals is clearer than
// satisfying that union in every fixture, so the result is widened here.
const mapped = (messages: AIMessage[]): unknown[] => toResponsesInput(messages);
const contentOf = (messages: AIMessage[], index = 0): unknown[] =>
  (mapped(messages)[index] as { content: unknown[] }).content;

describe("toResponsesInput", () => {
  // The bare string is the byte-stable form the prompt-cache prefix depends on.
  // Wrapping it in a one-element `input_text` array would be a different
  // request and would break every warm cache.
  test("a plain-string user message stays a bare string", () => {
    expect(mapped([{ role: "user", content: "hi" }])).toEqual([
      { role: "user", content: "hi" },
    ]);
  });

  test("an assistant message keeps its role and string content", () => {
    expect(mapped([{ role: "assistant", content: "prior answer" }])).toEqual([
      { role: "assistant", content: "prior answer" },
    ]);
  });

  test("text, image, audio and video parts map to their input items", () => {
    const messages: AIMessage[] = [
      {
        role: "user",
        content: [
          { type: "text", text: "look" },
          {
            type: "image",
            image: new Uint8Array([0, 1, 2]),
            mediaType: "image/png",
          },
          {
            type: "audio",
            audio: new Uint8Array([3, 4]),
            mediaType: "audio/mp3",
          },
          {
            type: "video",
            video: new Uint8Array([0, 1, 2, 3]),
            mediaType: "video/mp4",
          },
        ],
      },
    ];

    expect(mapped(messages)).toEqual([
      {
        role: "user",
        content: [
          { type: "input_text", text: "look" },
          {
            type: "input_image",
            detail: "auto",
            imageUrl: "data:image/png;base64,AAEC",
          },
          { type: "input_audio", inputAudio: { data: "AwQ=", format: "mp3" } },
          { type: "input_video", videoUrl: "data:video/mp4;base64,AAECAw==" },
        ],
      },
    ]);
  });

  test("audio/wav keeps its format; anything else is declared mp3", () => {
    const audio = (mediaType: string): AIMessage => ({
      role: "user",
      content: [{ type: "audio", audio: new Uint8Array([1]), mediaType }],
    });
    const formatOf = (m: AIMessage) =>
      (contentOf([m])[0] as { inputAudio: { format: string } }).inputAudio
        .format;

    expect(formatOf(audio("audio/wav"))).toBe("wav");
    expect(formatOf(audio("audio/mp3"))).toBe("mp3");
    expect(formatOf(audio("audio/mpeg"))).toBe("mp3");
  });

  // A Telegram album with a clip and several captions. Nothing was dropped by
  // the old mapper either — what changed is that video is now a first-class
  // item instead of a body override — but a mixed message is the shape most
  // likely to regress, so it is pinned.
  test("a mixed message keeps every part in order", () => {
    const messages: AIMessage[] = [
      {
        role: "user",
        content: [
          { type: "text", text: "one" },
          {
            type: "image",
            image: new Uint8Array([1, 2]),
            mediaType: "image/jpeg",
          },
          { type: "text", text: "two" },
          {
            type: "video",
            video: new Uint8Array([5, 6]),
            mediaType: "video/mp4",
          },
          { type: "text", text: "three" },
        ],
      },
    ];

    const parts = contentOf(messages) as { type: string }[];
    expect(parts.map((p) => p.type)).toEqual([
      "input_text",
      "input_image",
      "input_text",
      "input_video",
      "input_text",
    ]);
  });

  test("message order is preserved verbatim", () => {
    const messages: AIMessage[] = [
      { role: "user", content: "q1" },
      { role: "assistant", content: "a1" },
      { role: "user", content: "q2" },
    ];
    expect(mapped(messages)).toEqual([
      { role: "user", content: "q1" },
      { role: "assistant", content: "a1" },
      { role: "user", content: "q2" },
    ]);
  });

  test("an empty message list maps to an empty input", () => {
    expect(mapped([])).toEqual([]);
  });
});

describe("dataUrl", () => {
  test("round-trips bytes into a base64 data URL", () => {
    expect(dataUrl("video/mp4", new Uint8Array([0, 1, 2, 3]))).toBe(
      "data:video/mp4;base64,AAECAw==",
    );
    expect(dataUrl("image/jpeg", new Uint8Array([1, 2]))).toBe(
      "data:image/jpeg;base64,AQI=",
    );
    expect(dataUrl("image/png", new Uint8Array())).toBe("data:image/png;base64,");
  });
});

// A stored tool call has to reach the provider as a call. One record expands
// into the pair the Responses API defines — never one without the other, which
// is why call and result are stored together.
describe("toResponsesInput — replayed tool calls", () => {
  const CALL: AIMessage = {
    role: "tool",
    callId: "call_1",
    name: "fetch_page",
    arguments: '{"url":"https://e.x"}',
    output: '"# Page"',
  };

  test("one record becomes function_call + function_call_output", () => {
    expect(toResponsesInput([CALL])).toEqual([
      {
        type: "function_call",
        callId: "call_1",
        name: "fetch_page",
        arguments: '{"url":"https://e.x"}',
      },
      { type: "function_call_output", callId: "call_1", output: '"# Page"' },
    ]);
  });

  test("the pair keeps its place among the surrounding messages", () => {
    const items = toResponsesInput([
      { role: "user", content: "Q1" },
      CALL,
      { role: "assistant", content: "A1" },
      { role: "user", content: "Q2" },
    ]);
    expect(items.map((i) => (i as { type?: string; role?: string }).type ?? (i as { role: string }).role))
      .toEqual(["user", "function_call", "function_call_output", "assistant", "user"]);
  });

  // The id and the argument string are the provider's own words; re-encoding
  // them could change bytes the provider matched on.
  test("arguments and the call id are passed through untouched", () => {
    const odd: AIMessage = {
      role: "tool",
      callId: "call_x",
      name: "t",
      arguments: '{ "a" : 1,  "b":"  spaced  " }',
      output: "null",
    };
    const callItem = toResponsesInput([odd])[0] as unknown as {
      arguments: string;
      callId: string;
    };
    expect(callItem.arguments).toBe('{ "a" : 1,  "b":"  spaced  " }');
    expect(callItem.callId).toBe("call_x");
  });
});

// Not every provider issues call ids that are unique across responses, and the
// chain replays up to 20 turns into one request. A repeated id would leave the
// provider unable to tell which result answered which call.
describe("toResponsesInput — call id collisions", () => {
  const stored = (callId: string, name: string): AIMessage => ({
    role: "tool",
    callId,
    name,
    arguments: "{}",
    output: `"${name}"`,
  });

  test("a repeated id is made unique, and the pair moves together", () => {
    const items = toResponsesInput([
      stored("call_1", "first"),
      stored("call_1", "second"),
      stored("call_1", "third"),
    ]) as Array<{ callId: string; name?: string }>;

    expect(items.map((i) => i.callId)).toEqual([
      "call_1",
      "call_1",
      "call_1_2",
      "call_1_2",
      "call_1_3",
      "call_1_3",
    ]);
    // Every id appears exactly twice: once as the call, once as its result.
    const counts = new Map<string, number>();
    for (const i of items) counts.set(i.callId, (counts.get(i.callId) ?? 0) + 1);
    expect([...counts.values()]).toEqual([2, 2, 2]);
  });

  // The renamed form must not collide with a real id further down the list.
  test("a synthesized id that is itself taken keeps searching", () => {
    const items = toResponsesInput([
      stored("call_1", "a"),
      stored("call_1_2", "b"),
      stored("call_1", "c"),
    ]) as Array<{ callId: string }>;
    expect(new Set(items.map((i) => i.callId)).size).toBe(3);
    expect(items.map((i) => i.callId)).toContain("call_1_3");
  });

  // Ids that are already unique must not move: rewriting them would change the
  // cacheable prefix of every chain.
  test("distinct ids are left alone", () => {
    const items = toResponsesInput([
      stored("call_a", "a"),
      stored("call_b", "b"),
    ]) as Array<{ callId: string }>;
    expect(items.map((i) => i.callId)).toEqual([
      "call_a",
      "call_a",
      "call_b",
      "call_b",
    ]);
  });
});
