// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { QUARANTINE_TTL_MS } from "../../../storage/types/reminders";

// What the quarantine view can make of a raw payload. Deliberately forgiving:
// the record is here precisely because it failed validation, so nothing may be
// assumed about its shape — every field is best-effort and independently
// optional.
export type QuarantinePeek = {
  // The payload as it should be shown: pretty-printed when it parses as JSON,
  // verbatim when it does not.
  body: string;
  // Whether `body` was reformatted. The view uses it to say so; the payload
  // shown is the reformatted one either way.
  isJson: boolean;
  // Fields recovered from the blob, so a record can be matched to a person
  // without reading it. Null when absent or of the wrong type.
  userId: string | null;
  text: string | null;
};

// A recovered scalar is only worth showing if it reads as itself. Numbers are
// accepted for `userId` because a hand-written or re-serialized payload may
// carry the id unquoted — that is exactly the kind of record that ends up here.
function scalar(v: unknown, allowNumber: boolean): string | null {
  if (typeof v === "string") return v.length > 0 ? v : null;
  if (allowNumber && typeof v === "number" && Number.isFinite(v)) {
    return String(v);
  }
  return null;
}

export function peekQuarantinedPayload(raw: string): QuarantinePeek {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { body: raw, isJson: false, userId: null, text: null };
  }
  const body = JSON.stringify(parsed, null, 2) ?? raw;
  if (typeof parsed !== "object" || parsed === null) {
    return { body, isJson: true, userId: null, text: null };
  }
  const rec = parsed as Record<string, unknown>;
  return {
    body,
    isJson: true,
    userId: scalar(rec.userId, true),
    text: scalar(rec.text, false),
  };
}

// How much of the retention window is left. Clamped at zero: the payload key
// expires on its own, so a record whose window has run out is one the listing
// caught mid-expiry, not one that will linger.
export function quarantineTimeLeftMs(
  quarantinedAtMs: number,
  nowMs: number,
): number {
  return Math.max(0, quarantinedAtMs + QUARANTINE_TTL_MS - nowMs);
}
