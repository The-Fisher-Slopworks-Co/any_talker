// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { describe, expect, test } from "bun:test";
import { messageTimeString } from "./tz";

describe("messageTimeString", () => {
  const at = Date.UTC(2026, 9, 3, 9, 1);

  test("is the local wall clock followed by the UTC offset", () => {
    expect(messageTimeString(at, "Asia/Yekaterinburg")).toBe(
      "2026-10-03 14:01 +05:00",
    );
    expect(messageTimeString(at, "UTC")).toBe("2026-10-03 09:01 +00:00");
  });

  test("handles negative and half-hour offsets", () => {
    expect(messageTimeString(at, "America/New_York")).toBe(
      "2026-10-03 05:01 -04:00",
    );
    expect(messageTimeString(at, "Asia/Kolkata")).toBe(
      "2026-10-03 14:31 +05:30",
    );
  });

  test("follows the offset in effect at that moment", () => {
    expect(
      messageTimeString(Date.UTC(2026, 0, 15, 12, 0), "Europe/Berlin"),
    ).toBe("2026-01-15 13:00 +01:00");
    expect(
      messageTimeString(Date.UTC(2026, 6, 15, 12, 0), "Europe/Berlin"),
    ).toBe("2026-07-15 14:00 +02:00");
  });
});
