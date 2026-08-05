// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

// Date/time display format for the Web App. `null` (the default, stored as an
// absent key) means "auto": the viewer's device locale decides, imposing
// nothing. The explicit options are BCP-47 locales whose formatting Intl
// already knows, plus "iso" (rendered via the sv-SE locale, whose short
// date-time is the ISO 8601 shape `YYYY-MM-DD HH:mm:ss`).
export const DATE_FORMATS = [
  "ru-RU",
  "en-GB",
  "en-US",
  "de-DE",
  "iso",
] as const;

export type DateFormat = (typeof DATE_FORMATS)[number];

export function isValidDateFormat(v: unknown): v is DateFormat {
  return (DATE_FORMATS as readonly string[]).includes(v as string);
}

// Fixed sample instant used to render the format-picker option labels
// (day > 12 so day/month order is unambiguous).
export const DATE_FORMAT_SAMPLE_MS = Date.UTC(2026, 11, 31, 15, 45, 0);

// The single formatter behind every timestamp the Web App shows. Both
// arguments are "null = don't impose": a null format keeps the device locale,
// a null timezone keeps the device timezone. Stale/invalid stored values
// degrade to the device default instead of throwing.
export function formatDateTime(
  ms: number,
  format: string | null,
  timezone: string | null,
): string {
  const locale = !isValidDateFormat(format)
    ? undefined
    : format === "iso"
      ? "sv-SE"
      : format;
  try {
    return new Date(ms).toLocaleString(locale, {
      timeZone: timezone ?? undefined,
    });
  } catch {
    return new Date(ms).toLocaleString(locale);
  }
}
