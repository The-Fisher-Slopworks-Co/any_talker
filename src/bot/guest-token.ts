// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { Message } from "grammy/types";

// A guest answer carries the key of its own stored thread, as the name of an
// empty anchor after its body. `answerGuestQuery` returns an inline message id
// while a reply arrives with the chat's message id, so nothing Telegram hands
// back joins the two — the answer's own content is the only thing that
// survives the round trip. An anchor renders as nothing and comes back in the
// replied-to message's `rich_message.blocks`. Answers sent before the anchor
// carry the token as plain text on their last line instead.
//
// The leading letter keeps a token from ever looking like a chat id.
const TOKEN_ALPHABET =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const TOKEN_RANDOM_CHARS = 9;
const TOKEN = /^g[0-9A-Za-z]{9}$/;
// The last line of the message.
const TRAILING_TOKEN = /(?:^|\n)[ \t]*(g[0-9A-Za-z]{9})\s*$/;

const randomBytes = (count: number): Uint8Array =>
  crypto.getRandomValues(new Uint8Array(count));

// Each character takes the low six bits of a byte and redraws the two values
// past the alphabet: `byte % 62` would make the first eight characters a
// quarter likelier than the rest.
export function newGuestToken(random = randomBytes): string {
  let token = "g";
  while (token.length <= TOKEN_RANDOM_CHARS) {
    for (const byte of random(TOKEN_RANDOM_CHARS)) {
      const index = byte & 0b111111;
      if (index >= TOKEN_ALPHABET.length) continue;
      token += TOKEN_ALPHABET[index];
      if (token.length > TOKEN_RANDOM_CHARS) break;
    }
  }
  return token;
}

// The answer's footer: an anchor named after the token, invisible once rendered.
export function guestTokenAnchor(token: string): string {
  return `<a name="${token}"></a>`;
}

// Splits a replied-to answer into its token and the text without it. No token
// (an answer that predates them, an error notice, a plain-text fallback) leaves
// the text as it was.
export function splitGuestToken(text: string): {
  token: string | null;
  text: string;
} {
  const match = TRAILING_TOKEN.exec(text);
  if (!match) return { token: null, text };
  return {
    token: match[1] ?? null,
    text: text.slice(0, match.index).trimEnd(),
  };
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

// The first token-shaped anchor anywhere in the blocks, as a block of its own
// or inline in a paragraph.
function findAnchorToken(node: unknown): string | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const token = findAnchorToken(child);
      if (token !== null) return token;
    }
    return null;
  }
  if (!isRecord(node)) return null;
  if (
    node.type === "anchor" &&
    typeof node.name === "string" &&
    TOKEN.test(node.name)
  ) {
    return node.name;
  }
  return findAnchorToken(Object.values(node));
}

// The thread token a replied-to answer carries, and its text without it: the
// anchor of a current answer, else the last line of an older one.
export function readGuestToken(reply: Message): {
  token: string | null;
  text: string;
} {
  const split = splitGuestToken(repliedText(reply) ?? "");
  const anchored = findAnchorToken(reply.rich_message?.blocks);
  return anchored === null ? split : { token: anchored, text: split.text };
}

// RichText: a string, a list of them, or a formatting wrapper around one.
function inlineText(node: unknown): string {
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(inlineText).join("");
  if (!isRecord(node)) return "";
  if ("text" in node) return inlineText(node.text);
  if (typeof node.alternative_text === "string") return node.alternative_text;
  if (typeof node.expression === "string") return node.expression;
  return "";
}

function blockText(block: unknown): string {
  if (!isRecord(block)) return "";
  const parts: string[] = [];
  if ("summary" in block) parts.push(inlineText(block.summary));
  if ("text" in block) parts.push(inlineText(block.text));
  else if (typeof block.expression === "string") parts.push(block.expression);
  for (const key of ["items", "blocks"] as const) {
    const children = block[key];
    if (Array.isArray(children)) parts.push(...children.map(blockText));
  }
  if (Array.isArray(block.cells)) {
    for (const row of block.cells) {
      if (Array.isArray(row)) parts.push(row.map(inlineText).join(" | "));
    }
  }
  return parts.filter((p) => p !== "").join("\n");
}

// The text of a replied-to message. A rich message arrives as blocks rather
// than `text`, so those are flattened: enough to read the token back and to
// show the model what was said, not a faithful markdown round trip.
export function repliedText(reply: Message): string | null {
  const plain = reply.text ?? reply.caption;
  if (plain !== undefined) return plain;
  const blocks = reply.rich_message?.blocks;
  if (!blocks) return null;
  const text = blocks
    .map(blockText)
    .filter((p) => p !== "")
    .join("\n");
  return text === "" ? null : text;
}
