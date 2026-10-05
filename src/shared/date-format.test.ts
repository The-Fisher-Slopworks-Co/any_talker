// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import {
  DATE_FORMATS,
  formatDateTime,
  formatShortDateTime,
  isValidDateFormat,
} from "./date-format";

const SAMPLE = Date.UTC(2026, 11, 31, 15, 45, 0);

describe("isValidDateFormat", () => {
  test("accepts every catalogued format", () => {
    for (const f of DATE_FORMATS) expect(isValidDateFormat(f)).toBe(true);
  });

  test("rejects non-members and non-strings", () => {
    expect(isValidDateFormat("fr-FR")).toBe(false);
    expect(isValidDateFormat("")).toBe(false);
    expect(isValidDateFormat(null)).toBe(false);
    expect(isValidDateFormat(undefined)).toBe(false);
    expect(isValidDateFormat(42)).toBe(false);
  });
});

describe("formatDateTime", () => {
  test("iso renders as ISO 8601 in the given timezone", () => {
    expect(formatDateTime(SAMPLE, "iso", "UTC")).toBe("2026-12-31 15:45:00");
  });

  test("timezone shifts the rendered wall-clock time", () => {
    expect(formatDateTime(SAMPLE, "iso", "Europe/Moscow")).toBe(
      "2026-12-31 18:45:00",
    );
  });

  test("ru-RU renders day-first dotted date", () => {
    const out = formatDateTime(SAMPLE, "ru-RU", "UTC");
    expect(out).toContain("31.12.2026");
    expect(out).toContain("15:45");
  });

  test("en-US renders month-first date with 12-hour clock", () => {
    const out = formatDateTime(SAMPLE, "en-US", "UTC");
    expect(out).toContain("12/31/2026");
    expect(out).toContain("3:45");
  });

  test("null format falls back to the runtime default locale", () => {
    // Exact shape depends on the host locale — only assert it formats.
    const out = formatDateTime(SAMPLE, null, "UTC");
    expect(out.length).toBeGreaterThan(0);
  });

  test("unknown stored format degrades to auto instead of throwing", () => {
    const out = formatDateTime(SAMPLE, "not-a-format", "UTC");
    expect(out.length).toBeGreaterThan(0);
  });

  test("invalid timezone degrades to device timezone instead of throwing", () => {
    const out = formatDateTime(SAMPLE, "iso", "Mars/Phobos");
    expect(out).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });
});

describe("formatShortDateTime", () => {
  const WORDS = {
    today: "Today",
    yesterday: "Yesterday",
    tomorrow: "Tomorrow",
  };
  // Sunday 4 Oct 2026, 12:00 UTC.
  const NOW = Date.UTC(2026, 9, 4, 12, 0, 0);
  // Narrow no-break spaces before AM/PM differ between ICU versions.
  const short = (
    ms: number,
    format: string | null,
    timezone: string | null = "UTC",
  ) =>
    formatShortDateTime(ms, NOW, format, timezone, WORDS).replace(
      /[\u202f\u00a0]/g,
      " ",
    );

  test("today, yesterday and tomorrow replace the date by a word", () => {
    expect(short(Date.UTC(2026, 9, 4, 16, 39), "en-GB")).toBe("Today, 16:39");
    expect(short(Date.UTC(2026, 9, 3, 8, 5), "en-GB")).toBe("Yesterday, 08:05");
    expect(short(Date.UTC(2026, 9, 5, 23, 59), "en-GB")).toBe(
      "Tomorrow, 23:59",
    );
  });

  test("an earlier time today is still today, not a past day", () => {
    expect(short(Date.UTC(2026, 9, 4, 0, 0), "en-GB")).toBe("Today, 00:00");
  });

  test("other days of this year show the date and the time, no year", () => {
    expect(short(Date.UTC(2026, 9, 6, 16, 39), "en-US")).toBe("Oct 6, 4:39 PM");
    expect(short(Date.UTC(2026, 0, 2, 9, 12), "en-US")).toBe("Jan 2, 9:12 AM");
  });

  test("other years show the date with the year and no time", () => {
    expect(short(Date.UTC(2025, 9, 6, 16, 39), "en-US")).toBe("Oct 6, 2025");
    expect(short(Date.UTC(2027, 0, 1, 1, 0), "en-US")).toBe("Jan 1, 2027");
  });

  test("the time follows the locale's own clock", () => {
    const ms = Date.UTC(2026, 9, 4, 16, 39);
    expect(short(ms, "en-US")).toBe("Today, 4:39 PM");
    expect(short(ms, "en-GB")).toBe("Today, 16:39");
    expect(short(ms, "ru-RU")).toBe("Today, 16:39");
    expect(short(ms, "de-DE")).toBe("Today, 16:39");
    expect(short(ms, "iso")).toBe("Today, 16:39");
  });

  test("locales order and spell the date their own way", () => {
    const ms = Date.UTC(2026, 9, 6, 16, 39);
    expect(short(ms, "en-GB")).toBe("6 Oct, 16:39");
    expect(short(ms, "ru-RU")).toBe("6 окт., 16:39");
    expect(short(Date.UTC(2025, 9, 6), "ru-RU")).toContain("2025");
  });

  test("iso keeps the numeric year-first date", () => {
    expect(short(Date.UTC(2026, 9, 6, 16, 39), "iso")).toBe("2026-10-06 16:39");
    expect(short(Date.UTC(2025, 9, 6, 16, 39), "iso")).toBe("2025-10-06");
  });

  test("days are counted on the timezone's wall clock", () => {
    // 23:30 UTC on the 4th is already the 5th in Tokyo, where "now" (21:00
    // on the 4th) makes it tomorrow.
    const lateUtc = Date.UTC(2026, 9, 4, 23, 30);
    expect(short(lateUtc, "en-GB", "UTC")).toBe("Today, 23:30");
    expect(short(lateUtc, "en-GB", "Asia/Tokyo")).toBe("Tomorrow, 08:30");
    // 02:00 UTC on the 4th is still the 3rd in Los Angeles.
    const earlyUtc = Date.UTC(2026, 9, 4, 2, 0);
    expect(short(earlyUtc, "en-GB", "America/Los_Angeles")).toBe(
      "Yesterday, 19:00",
    );
  });

  test("the year boundary follows the timezone too", () => {
    const newYearUtc = Date.UTC(2026, 11, 31, 23, 0);
    // Still 2026 in UTC; already 2027 in Tokyo.
    expect(short(newYearUtc, "en-US", "UTC")).toBe("Dec 31, 11:00 PM");
    expect(short(newYearUtc, "en-US", "Asia/Tokyo")).toBe("Jan 1, 2027");
  });

  test("a null timezone and format fall back to the device defaults", () => {
    const out = formatShortDateTime(NOW, NOW, null, null, WORDS);
    expect(out.startsWith("Today, ")).toBe(true);
  });

  test("an unknown timezone degrades to the device timezone", () => {
    const out = formatShortDateTime(NOW, NOW, "en-GB", "Not/AZone", WORDS);
    expect(out.startsWith("Today, ")).toBe(true);
  });

  test("an unknown format degrades to the device locale", () => {
    const out = formatShortDateTime(NOW, NOW, "xx-XX", "UTC", WORDS);
    expect(out.startsWith("Today, ")).toBe(true);
  });
});
