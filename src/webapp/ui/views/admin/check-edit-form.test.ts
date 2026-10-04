// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { formatClock, parseClock } from "./check-edit-form";

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
