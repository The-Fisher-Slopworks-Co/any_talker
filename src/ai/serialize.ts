// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type {
  AIMessage,
  AIUserContentPart,
  SerializedAIMessage,
  SerializedAIUserContentPart,
} from "./types";

// Stands in for a video part in a stored snapshot. Model-facing text, like the
// reply-context headers in `bot/context-builder.ts`.
export const VIDEO_SNAPSHOT_MARKER =
  "[a video clip was attached here; it is not kept in this saved context]";

export function serializeMessages(msgs: AIMessage[]): SerializedAIMessage[] {
  return msgs.map((m) => {
    if (m.role === "assistant") return { role: "assistant", content: m.content };
    // A replayed tool call is four plain strings; the stored form is the live
    // one, so it survives a snapshot untouched.
    if (m.role === "tool") return m;
    if (typeof m.content === "string") {
      return { role: "user", content: m.content };
    }
    const parts: SerializedAIUserContentPart[] = m.content.map((p) => {
      if (p.type === "text") return { type: "text", text: p.text };
      if (p.type === "image") {
        return {
          type: "image",
          image_base64: Buffer.from(p.image).toString("base64"),
          mediaType: p.mediaType,
        };
      }
      if (p.type === "audio") {
        return {
          type: "audio",
          audio_base64: Buffer.from(p.audio).toString("base64"),
          mediaType: p.mediaType,
        };
      }
      // A clip is dropped from the snapshot, not stored: see
      // `SerializedAIUserContentPart`. The marker keeps the turn readable —
      // when this context is replayed at reminder delivery, the model still
      // knows a video was part of the conversation it is reminding about.
      return { type: "text", text: VIDEO_SNAPSHOT_MARKER };
    });
    return { role: "user", content: parts };
  });
}

export function deserializeMessages(
  msgs: SerializedAIMessage[],
): AIMessage[] {
  return msgs.map((m) => {
    if (m.role === "assistant") return { role: "assistant", content: m.content };
    if (m.role === "tool") return m;
    if (typeof m.content === "string") {
      return { role: "user", content: m.content };
    }
    const parts: AIUserContentPart[] = m.content.map((p) => {
      if (p.type === "text") {
        return { type: "text", text: p.text };
      }
      if (p.type === "image") {
        return {
          type: "image",
          image: new Uint8Array(Buffer.from(p.image_base64, "base64")),
          mediaType: p.mediaType,
        };
      }
      if (p.type === "audio") {
        return {
          type: "audio",
          audio: new Uint8Array(Buffer.from(p.audio_base64, "base64")),
          mediaType: p.mediaType,
        };
      }
      const _exhaustive: never = p;
      throw new Error(`unknown serialized part: ${JSON.stringify(_exhaustive)}`);
    });
    return { role: "user", content: parts };
  });
}
