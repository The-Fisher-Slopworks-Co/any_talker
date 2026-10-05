// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import {
  anchorForSource,
  formatAnchorDate,
  formatClock,
  parseClock,
} from "./check-edit-form";

describe("check editor counter source", () => {
  const now = Date.UTC(2026, 9, 4, 22, 30);

  test("a hand-kept counter has no start date", () => {
    expect(anchorForSource(false, "2026-01-01", "UTC", now)).toBeNull();
  });

  test("choosing the date source starts from today in the check's zone", () => {
    expect(anchorForSource(true, null, "UTC", now)).toBe("2026-10-04");
    // 22:30 UTC is already the next day in Moscow.
    expect(anchorForSource(true, null, "Europe/Moscow", now)).toBe(
      "2026-10-05",
    );
  });

  test("keeps the start date already set", () => {
    expect(anchorForSource(true, "2026-01-01", "UTC", now)).toBe("2026-01-01");
  });

  test("writes the start date in the viewer's language", () => {
    expect(formatAnchorDate("2026-01-02", "en")).toBe("Jan 2, 2026");
    expect(formatAnchorDate("2026-01-02", "ru")).toBe("2 янв. 2026 г.");
  });
});

describe("check editor clock", () => {
  test("shows the time as the HH:MM a time input takes", () => {
    expect(formatClock(8, 5)).toBe("08:05");
    expect(formatClock(23, 30)).toBe("23:30");
    expect(formatClock(0, 0)).toBe("00:00");
  });

  test("reads the hour and minute back", () => {
    expect(parseClock("08:05")).toEqual({ hour: 8, minute: 5 });
    expect(parseClock("23:59")).toEqual({ hour: 23, minute: 59 });
  });

  test("tolerates the seconds some browsers append", () => {
    expect(parseClock("07:15:30")).toEqual({ hour: 7, minute: 15 });
  });

  test("reads a cleared input as no time", () => {
    expect(parseClock("")).toBeNull();
    expect(parseClock("8:30")).toBeNull();
  });
});
