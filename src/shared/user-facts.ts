// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

// Single source of truth for the user-fact key/value contract, shared by the
// AI tool layer (Zod schemas in ai/tools/user-facts.ts) and the Web App API's
// hand-rolled validators, so the two surfaces can never drift apart.

export const FACT_KEY_REGEX = /^[a-z0-9_]+$/i;
export const FACT_KEY_MAX_LEN = 64;
export const FACT_VALUE_MAX_LEN = 500;

// Returns the lowercased key when the input is a valid fact key, else null.
// Keys are case-insensitive identities: storage lowercases them on write, so
// normalizing here keeps lookups and stored keys aligned.
export function normalizeFactKey(input: unknown): string | null {
  if (typeof input !== "string") return null;
  if (input.length === 0 || input.length > FACT_KEY_MAX_LEN) return null;
  if (!FACT_KEY_REGEX.test(input)) return null;
  return input.toLowerCase();
}

export function normalizeFactValue(input: unknown): string | null {
  if (typeof input !== "string") return null;
  if (input.length === 0 || input.length > FACT_VALUE_MAX_LEN) return null;
  return input;
}
