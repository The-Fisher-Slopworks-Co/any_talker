// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { AIMessage } from "./types";

// The messages a model call is sent, as an append-only log.
//
// A provider's prompt cache only covers a prefix: a turn is cheap exactly when
// it sends everything the previous turn sent, unchanged, followed by what
// happened since. Rewriting, dropping or reordering anything already in the
// list moves that prefix and re-charges the whole history at full price.
//
// `Transcript` is the only shape `AIClient.ask` accepts, and the only ways to
// get one are `transcript` and `append` — the brand is a module-private symbol,
// so a plain array does not type-check where a transcript is expected. It is a
// `readonly` array, so `push`, `splice`, `sort` and index writes do not compile
// on it; `append` returns a NEW transcript that keeps its argument as an exact
// prefix. Both freeze what they return (messages and their content arrays
// included), so a cast that sneaks past the types still cannot edit history.
declare const appendOnly: unique symbol;

export type Transcript = readonly Readonly<AIMessage>[] & {
  readonly [appendOnly]: true;
};

export const emptyTranscript: Transcript = seal([]);

export function transcript(messages: readonly AIMessage[]): Transcript {
  return append(emptyTranscript, ...messages);
}

export function append(
  history: Transcript,
  ...messages: AIMessage[]
): Transcript {
  return seal([...history, ...messages.map(freezeMessage)]);
}

function seal(messages: readonly AIMessage[]): Transcript {
  return Object.freeze(messages) as Transcript;
}

// Freezes the message and its content parts, never the media bytes: a typed
// array with elements cannot be frozen, and the bytes are not what a prefix
// comparison is in danger of losing.
function freezeMessage(m: AIMessage): AIMessage {
  if (m.role === "user" && typeof m.content !== "string") {
    for (const part of m.content) Object.freeze(part);
    Object.freeze(m.content);
  }
  return Object.freeze(m);
}
