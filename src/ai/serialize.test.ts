// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import {
  serializeMessages,
  deserializeMessages,
  VIDEO_SNAPSHOT_MARKER,
} from "./serialize";
import type { AIMessage } from "./types";

// The message unions now also cover replayed tool calls, which carry `output`
// rather than `content`. These fixtures never build one, so a hit here means a
// broken fixture, not a case to handle.
function contentOf<T extends { role: string }>(m: T): unknown {
  if (!("content" in m)) throw new Error(`no content on a ${m.role} message`);
  return (m as { content: unknown }).content;
}


describe("serializeMessages / deserializeMessages", () => {
  test("round-trips text-only user and assistant messages", () => {
    const msgs: AIMessage[] = [
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi there" },
      { role: "user", content: "another" },
    ];
    expect(deserializeMessages(serializeMessages(msgs))).toEqual(msgs);
  });

  test("round-trips a user message with image bytes via base64", () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 1, 2, 3]);
    const msgs: AIMessage[] = [
      {
        role: "user",
        content: [
          { type: "text", text: "look:" },
          { type: "image", image: bytes, mediaType: "image/jpeg" },
        ],
      },
    ];
    const serialized = serializeMessages(msgs);
    const part0 = (contentOf(serialized[0]!) as { type: string }[])[0]!;
    const part1 = (contentOf(serialized[0]!) as { type: string }[])[1] as {
      type: "image";
      image_base64: string;
      mediaType: string;
    };
    expect(part0.type).toBe("text");
    expect(part1.type).toBe("image");
    expect(part1.mediaType).toBe("image/jpeg");
    expect(typeof part1.image_base64).toBe("string");

    const back = deserializeMessages(serialized);
    const recoveredParts = contentOf(back[0]!) as Array<
      { type: "text"; text: string } | { type: "image"; image: Uint8Array; mediaType: string }
    >;
    const img = recoveredParts[1]!;
    if (img.type !== "image") throw new Error();
    expect(Array.from(img.image)).toEqual(Array.from(bytes));
    expect(img.mediaType).toBe("image/jpeg");
  });

  test("round-trips a user message with audio bytes via base64", () => {
    const bytes = new Uint8Array([0x4f, 0x67, 0x67, 0x53, 1, 2, 3]); // "OggS" + data
    const msgs: AIMessage[] = [
      {
        role: "user",
        content: [
          { type: "text", text: "transcribe:" },
          { type: "audio", audio: bytes, mediaType: "audio/ogg" },
        ],
      },
    ];
    const serialized = serializeMessages(msgs);
    const part1 = (contentOf(serialized[0]!) as { type: string }[])[1] as {
      type: "audio";
      audio_base64: string;
      mediaType: string;
    };
    expect(part1.type).toBe("audio");
    expect(part1.mediaType).toBe("audio/ogg");
    expect(typeof part1.audio_base64).toBe("string");

    const back = deserializeMessages(serialized);
    const recovered = contentOf(back[0]!) as Array<
      | { type: "text"; text: string }
      | { type: "audio"; audio: Uint8Array; mediaType: string }
    >;
    const audio = recovered[1]!;
    if (audio.type !== "audio") throw new Error();
    expect(Array.from(audio.audio)).toEqual(Array.from(bytes));
    expect(audio.mediaType).toBe("audio/ogg");
  });

  test("a video part is replaced by a marker, never stored as bytes", () => {
    // A stored reminder has no TTL and is re-sent verbatim at delivery, so a
    // 20 MB clip must not end up base64'd inside it.
    const msgs: AIMessage[] = [
      {
        role: "user",
        content: [
          { type: "text", text: "remind me about this" },
          {
            type: "video",
            video: new Uint8Array([0, 1, 2, 3]),
            mediaType: "video/mp4",
          },
        ],
      },
    ];
    const serialized = serializeMessages(msgs);
    expect(contentOf(serialized[0]!)).toEqual([
      { type: "text", text: "remind me about this" },
      { type: "text", text: VIDEO_SNAPSHOT_MARKER },
    ]);
    expect(JSON.stringify(serialized)).not.toContain("AAECAw");

    // And the marker survives the round trip as ordinary text.
    expect(deserializeMessages(serialized)).toEqual([
      {
        role: "user",
        content: [
          { type: "text", text: "remind me about this" },
          { type: "text", text: VIDEO_SNAPSHOT_MARKER },
        ],
      },
    ]);
  });

  test("serialized form is JSON-safe (no Uint8Array)", () => {
    const msgs: AIMessage[] = [
      {
        role: "user",
        content: [
          {
            type: "image",
            image: new Uint8Array([1, 2, 3]),
            mediaType: "image/png",
          },
        ],
      },
    ];
    const json = JSON.stringify(serializeMessages(msgs));
    const parsed = JSON.parse(json);
    const recovered = deserializeMessages(parsed);
    const part = (contentOf(recovered[0]!) as Array<{ type: string }>)[0]!;
    if (part.type !== "image") throw new Error();
    expect(
      Array.from((part as unknown as { image: Uint8Array }).image),
    ).toEqual([1, 2, 3]);
  });

  test("empty array round-trips", () => {
    expect(deserializeMessages(serializeMessages([]))).toEqual([]);
  });
});

// Reminder snapshots capture the exact message list an ask was built from, so
// a chain that replayed tool calls must survive the round trip — otherwise the
// reminder is delivered against a thinner conversation than the one it was set
// in.
describe("tool calls in a snapshot", () => {
  const CALL: AIMessage = {
    role: "tool",
    callId: "call_1",
    name: "fetch_page",
    arguments: '{"url":"https://e.x"}',
    output: '"# Page"',
  };

  test("a tool message round-trips unchanged", () => {
    const msgs: AIMessage[] = [
      { role: "user", content: "Q1" },
      CALL,
      { role: "assistant", content: "A1" },
    ];
    expect(deserializeMessages(serializeMessages(msgs))).toEqual(msgs);
  });

  test("it survives an actual JSON round trip", () => {
    const back = deserializeMessages(
      JSON.parse(JSON.stringify(serializeMessages([CALL]))),
    );
    expect(back).toEqual([CALL]);
  });
});
