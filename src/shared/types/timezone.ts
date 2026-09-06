// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

// Cache results so hot paths don't pay for an Intl.DateTimeFormat allocation
// per call. The IANA tz database is closed under runtime updates we care
// about, and an unbounded set keyed by tz string is still tiny.
const TZ_VALID = new Set<string>();
const TZ_INVALID = new Set<string>();

export function isValidTimezone(tz: string): boolean {
  if (typeof tz !== "string" || tz.length === 0) return false;
  if (TZ_VALID.has(tz)) return true;
  if (TZ_INVALID.has(tz)) return false;
  try {
    Intl.DateTimeFormat("en-US", { timeZone: tz });
    TZ_VALID.add(tz);
    return true;
  } catch {
    TZ_INVALID.add(tz);
    return false;
  }
}

// Returns the canonical IANA tz name (e.g. "Europe/Moscow") for an input that
// may differ in case ("europe/moscow") or be a deprecated alias. Returns null
// if the input is not a valid timezone.
export function canonicalizeTimezone(tz: string): string | null {
  if (!isValidTimezone(tz)) return null;
  return new Intl.DateTimeFormat("en-US", { timeZone: tz }).resolvedOptions()
    .timeZone;
}
