// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type {
  AIMessage,
  SerializedAIMessage,
  SerializedAIUserContentPart,
} from "./types";

export function serializeMessages(msgs: AIMessage[]): SerializedAIMessage[] {
  return msgs.map((m) => {
    if (m.role === "assistant") return { role: "assistant", content: m.content };
    if (typeof m.content === "string") {
      return { role: "user", content: m.content };
    }
    const parts: SerializedAIUserContentPart[] = m.content.map((p) =>
      p.type === "text"
        ? { type: "text", text: p.text }
        : {
            type: "image",
            image_base64: Buffer.from(p.image).toString("base64"),
            mediaType: p.mediaType,
          },
    );
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
    const parts = m.content.map((p) =>
      p.type === "text"
        ? { type: "text" as const, text: p.text }
        : {
            type: "image" as const,
            image: new Uint8Array(Buffer.from(p.image_base64, "base64")),
            mediaType: p.mediaType,
          },
    );
    return { role: "user", content: parts };
  });
}
