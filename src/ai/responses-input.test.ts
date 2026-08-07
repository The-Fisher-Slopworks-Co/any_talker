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
