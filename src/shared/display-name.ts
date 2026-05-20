// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

export const DISPLAY_NAME_MAX_LEN = 32;

export type DisplayNameError =
  | "too_long"
  | "multiline"
  | "control_char"
  | "charset"
  | "blocked_token"
  | "no_letter";

export type DisplayNameResult =
  | { ok: true; value: string | null }
  | { ok: false; reason: DisplayNameError };

const ALLOWED_CHARS = /^[\p{L}\p{M}\p{Nd} .'\-]+$/u;
const CONTROL_CHARS = /[\p{Cc}\p{Cf}\p{Co}\p{Cn}\p{Cs}]/u;
const HAS_LETTER = /\p{L}/u;
const MULTILINE_CHARS = /[\n\r\t]/;

// Kept as an explicit defense in depth on top of the whitelist above. If the
// whitelist is ever loosened, these substrings remain blocked outright.
const BLOCKED_TOKENS: readonly string[] = [
  "<|im_start|>",
  "<|im_end|>",
  "<|endoftext|>",
  "<|system|>",
  "<|user|>",
  "<|assistant|>",
  "[inst]",
  "[/inst]",
  "<<sys>>",
  "<</sys>>",
  "</s>",
  "<system>",
  "</system>",
  "system:",
  "assistant:",
  "user:",
  "developer:",
  "tool:",
];

export function validateDisplayName(input: unknown): DisplayNameResult {
  if (input === null || input === undefined) return { ok: true, value: null };
  if (typeof input !== "string") return { ok: true, value: null };

  const normalized = input.normalize("NFC").trim();
  if (normalized.length === 0) return { ok: true, value: null };

  if (Array.from(normalized).length > DISPLAY_NAME_MAX_LEN) {
    return { ok: false, reason: "too_long" };
  }
  if (MULTILINE_CHARS.test(normalized)) {
    return { ok: false, reason: "multiline" };
  }
  if (CONTROL_CHARS.test(normalized)) {
    return { ok: false, reason: "control_char" };
  }

  const lower = normalized.toLowerCase();
  for (const token of BLOCKED_TOKENS) {
    if (lower.includes(token)) return { ok: false, reason: "blocked_token" };
  }

  if (!ALLOWED_CHARS.test(normalized)) {
    return { ok: false, reason: "charset" };
  }
  if (!HAS_LETTER.test(normalized)) {
    return { ok: false, reason: "no_letter" };
  }

  return { ok: true, value: normalized };
}
