// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import {
  DATE_FORMATS,
  formatDateTime,
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
