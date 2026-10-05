// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { Lang } from "./i18n";

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

// The locale a stored format stands for; undefined = the device's own.
function resolveLocale(format: string | null): string | undefined {
  if (!isValidDateFormat(format)) return undefined;
  return format === "iso" ? "sv-SE" : format;
}

// The zone itself if Intl knows it, else undefined (the device zone): a stale
// stored zone must not throw from inside a render.
function resolveZone(timezone: string | null): string | undefined {
  if (timezone === null) return undefined;
  try {
    return new Intl.DateTimeFormat(undefined, {
      timeZone: timezone,
    }).resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}

// The single formatter behind every timestamp the Web App shows. Both
// arguments are "null = don't impose": a null format keeps the device locale,
// a null timezone keeps the device timezone. Stale/invalid stored values
// degrade to the device default instead of throwing.
export function formatDateTime(
  ms: number,
  format: string | null,
  timezone: string | null,
): string {
  const locale = resolveLocale(format);
  try {
    return new Date(ms).toLocaleString(locale, {
      timeZone: timezone ?? undefined,
    });
  } catch {
    return new Date(ms).toLocaleString(locale);
  }
}

// The relative day words a short date swaps in for the calendar date.
export type RelativeDayWords = {
  today: string;
  yesterday: string;
  tomorrow: string;
};

type Zone = { timeZone: string | undefined };

// Calendar date of an instant on the wall clock of the zone: its year and a
// day number, so two instants compare by whole days.
function calendarDay(ms: number, zone: Zone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    ...zone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(ms);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value);
  const year = get("year");
  return {
    year,
    dayNumber: Date.UTC(year, get("month") - 1, get("day")) / 864e5,
  };
}

// A 24-hour clock zero-pads its hours ("08:05"); a 12-hour one does not
// ("8:05 AM").
function is12h(locale: string | undefined): boolean {
  const cycle = new Intl.DateTimeFormat(locale, {
    hour: "numeric",
  }).resolvedOptions().hourCycle;
  return cycle === "h11" || cycle === "h12";
}

function shortDateTime(
  ms: number,
  nowMs: number,
  locale: string | undefined,
  iso: boolean,
  zone: Zone,
  words: RelativeDayWords,
): string {
  const at = new Date(ms);
  const time = at.toLocaleTimeString(locale, {
    ...zone,
    hour: is12h(locale) ? "numeric" : "2-digit",
    minute: "2-digit",
  });
  const day = calendarDay(ms, zone);
  const today = calendarDay(nowMs, zone);
  const offset = day.dayNumber - today.dayNumber;
  if (offset === 0) return `${words.today}, ${time}`;
  if (offset === -1) return `${words.yesterday}, ${time}`;
  if (offset === 1) return `${words.tomorrow}, ${time}`;

  const sameYear = day.year === today.year;
  const date = iso
    ? at.toLocaleDateString(locale, {
        ...zone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      })
    : at.toLocaleDateString(locale, {
        ...zone,
        ...(sameYear ? {} : { year: "numeric" }),
        month: "short",
        day: "numeric",
      });
  if (!sameYear) return date;
  return `${date}${iso ? " " : ", "}${time}`;
}

// The compact date the Web App's lists show: "Today, 19:39", "Yesterday, …",
// "Tomorrow, …", "Oct 6, 16:39" within this year, "Oct 6, 2025" in any other
// (the time of day stops mattering there). Days are counted on the viewer's
// wall clock, the time follows the locale's own 12h/24h clock, and, like
// `formatDateTime`, null arguments mean "don't impose".
export function formatShortDateTime(
  ms: number,
  nowMs: number,
  format: string | null,
  timezone: string | null,
  words: RelativeDayWords,
): string {
  return shortDateTime(
    ms,
    nowMs,
    resolveLocale(format),
    format === "iso",
    { timeZone: resolveZone(timezone) },
    words,
  );
}

// Bot replies have no device locale to fall back on, so an unset preference
// follows the reply language instead. Minutes are the finest unit a chat
// message needs, so seconds are dropped.
const LANG_DATE_FORMAT: Record<Lang, DateFormat> = {
  en: "en-GB",
  ru: "ru-RU",
};

export function formatBotDateTime(
  ms: number,
  format: DateFormat | null,
  lang: Lang,
  timezone: string,
): string {
  const f = format ?? LANG_DATE_FORMAT[lang];
  return new Date(ms).toLocaleString(f === "iso" ? "sv-SE" : f, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timezone,
  });
}
