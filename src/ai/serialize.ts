// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type {
  AIMessage,
  AIUserContentPart,
  SerializedAIMessage,
  SerializedAIUserContentPart,
} from "./types";

export function serializeMessages(msgs: AIMessage[]): SerializedAIMessage[] {
  return msgs.map((m) => {
    if (m.role === "assistant") return { role: "assistant", content: m.content };
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
      return {
        type: "audio",
        audio_base64: Buffer.from(p.audio).toString("base64"),
        mediaType: p.mediaType,
      };
    });
    return { role: "user", content: parts };
  });
}

export function deserializeMessages(
  msgs: SerializedAIMessage[],
): AIMessage[] {
  return msgs.map((m) => {
    if (m.role === "assistant") return { role: "assistant", content: m.content };
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
