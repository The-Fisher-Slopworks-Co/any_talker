// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { EasyInputMessageContentUnion1, Item } from "@openrouter/agent";
import type { AIMessage, AIUserContentPart } from "./types";

// One content part of a Responses `input` message, as the SDK models it
// (`input_text` | `input_image` | `input_file` | `input_audio` | `input_video`).
type ContentPart = EasyInputMessageContentUnion1;

// Maps our domain messages onto Responses API input items.
//
// - a user message whose content is a plain string stays a BARE STRING — that
//   is the byte-stable form the prompt-cache prefix depends on;
// - a `tool` message expands into the `function_call` / `function_call_output`
//   pair it stands for, which is why this is a flatMap;
// - an assistant message becomes an `EasyInputMessage` with `role:"assistant"`.
//   The agent's `Item` union only models assistant messages as full
//   `OutputMessage`s (with an `id` and `output_text` content), but the SDK's
//   request union accepts the easy form and OpenRouter round-trips it — hence
//   the single cast below;
// - video is a first-class `input_video` item. The old mapper needed a special
//   video branch that collapsed the SDK-visible content to one text part and
//   then overrode the outgoing body via `providerOptions.openaiCompatible`;
//   that override mapped every part, so nothing was dropped on the wire then
//   either — what goes away is the escape hatch and its branch, not a bug.
//
// The system prompt is never an input item: it rides on the request's top-level
// `instructions` field, which is what keeps the cacheable prefix stable.
export function toResponsesInput(messages: AIMessage[]): Item[] {
  // Call ids only have to be unique WITHIN a request, and not every provider
  // issues ids that are unique across responses — a `call_1`-per-response
  // scheme is enough to make a 20-turn chain emit the same id twice, which
  // leaves the pairing ambiguous. Uniqueness is enforced here, at the one place
  // that emits the pair, rather than trusted from storage.
  const usedCallIds = new Set<string>();

  return messages.flatMap((m): Item[] => {
    // A replayed tool call is two items, not one: the call the model made and
    // the result it was given. They are stored as a single record precisely so
    // this expansion can never emit one without the other — a `function_call`
    // with no matching `function_call_output` is a malformed request.
    //
    // `arguments` goes back exactly as the model wrote it. Response-item ids
    // are deliberately not persisted or replayed: they are optional on an input
    // item, and `callId` is what pairs the two.
    if (m.role === "tool") {
      const callId = uniqueCallId(m.callId, usedCallIds);
      return [
        {
          type: "function_call",
          callId,
          name: m.name,
          arguments: m.arguments,
        },
        { type: "function_call_output", callId, output: m.output },
      ];
    }
    if (m.role === "assistant") {
      // `EasyInputMessage` with `role:"assistant"` is valid on the wire (the
      // SDK's request union accepts it) but absent from the agent's `Item`
      // union, which only models assistant messages as `OutputMessage`s.
      return [{ role: "assistant", content: m.content } as unknown as Item];
    }
    if (typeof m.content === "string") {
      return [{ role: "user", content: m.content }];
    }
    return [{ role: "user", content: m.content.map(toContentPart) }];
  });
}

// Returns `callId` when it is still free, otherwise the first `<callId>_<n>`
// that is. Deterministic and order-driven: a chain only ever grows at the end,
// so an id already emitted keeps the same form on every later turn and the
// cacheable prefix does not move.
function uniqueCallId(callId: string, used: Set<string>): string {
  let candidate = callId;
  for (let n = 2; used.has(candidate); n++) candidate = `${callId}_${n}`;
  used.add(candidate);
  return candidate;
}

function toContentPart(part: AIUserContentPart): ContentPart {
  switch (part.type) {
    case "text":
      return { type: "input_text", text: part.text };
    case "image":
      // `detail` is required by the schema; "auto" reproduces the old
      // `image_url`-without-detail behaviour.
      return {
        type: "input_image",
        detail: "auto",
        imageUrl: dataUrl(part.mediaType, part.image),
      };
    case "audio":
      // Only wav and mp3 are accepted, so Telegram's ogg voice notes are
      // transcoded upstream (`bot/audio.ts`) before they reach here.
      return {
        type: "input_audio",
        inputAudio: {
          data: Buffer.from(part.audio).toString("base64"),
          format: part.mediaType === "audio/wav" ? "wav" : "mp3",
        },
      };
    case "video":
      return {
        type: "input_video",
        videoUrl: dataUrl(part.mediaType, part.video),
      };
  }
}

// `data:<mediaType>;base64,<…>` — the form both `imageUrl` and `videoUrl` take.
export function dataUrl(mediaType: string, bytes: Uint8Array): string {
  return `data:${mediaType};base64,${Buffer.from(bytes).toString("base64")}`;
}
