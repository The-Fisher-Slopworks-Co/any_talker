// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { normalizeCheckInput } from "./validate";

function valid(over: Record<string, unknown> = {}) {
  return {
    title: "Sport for Nikita",
    chatId: "-100123456",
    targetUserId: "42",
    targetName: "Nikita",
    scheduleHour: 23,
    scheduleMinute: 30,
    timezone: "Europe/Moscow",
    question: "{name}, sport?",
    yesButton: "Yes",
    noButton: "No",
    yesReply: "{name}, lying. Day {count}",
    noReply: "{name}. Day {count}",
    timeoutMinutes: 25,
    counter: 722,
    counterMode: "always_increment",
    enabled: true,
    ...over,
  };
}

describe("normalizeCheckInput", () => {
  test("accepts a full valid payload", () => {
    const r = normalizeCheckInput(valid());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.title).toBe("Sport for Nikita");
      expect(r.value.timeoutMinutes).toBe(25);
      expect(r.value.counterMode).toBe("always_increment");
    }
  });

  test("trims string fields", () => {
    const r = normalizeCheckInput(
      valid({
        title: "  trim me  ",
        targetName: "  Bob  ",
      }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.title).toBe("trim me");
      expect(r.value.targetName).toBe("Bob");
    }
  });

  test("rejects empty title", () => {
    const r = normalizeCheckInput(valid({ title: "   " }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("title_empty");
  });

  test("rejects invalid hour", () => {
    const r = normalizeCheckInput(valid({ scheduleHour: 24 }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("schedule_hour_invalid");
  });

  test("rejects invalid minute", () => {
    const r = normalizeCheckInput(valid({ scheduleMinute: 60 }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("schedule_minute_invalid");
  });

  test("rejects invalid timezone", () => {
    const r = normalizeCheckInput(valid({ timezone: "Mars/Phobos" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("timezone_invalid");
  });

  test("rejects out-of-range timeout", () => {
    const r = normalizeCheckInput(valid({ timeoutMinutes: 0 }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("timeout_minutes_invalid");
  });

  test("rejects negative counter", () => {
    const r = normalizeCheckInput(valid({ counter: -1 }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("counter_invalid");
  });

  test("rejects unknown counterMode", () => {
    const r = normalizeCheckInput(valid({ counterMode: "magic" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("counter_mode_invalid");
  });

  test("defaults enabled=true when omitted", () => {
    const v = valid();
    delete (v as { enabled?: unknown }).enabled;
    const r = normalizeCheckInput(v);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.enabled).toBe(true);
  });

  test("accepts enabled=false explicitly", () => {
    const r = normalizeCheckInput(valid({ enabled: false }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.enabled).toBe(false);
  });

  test("counterAnchorDate defaults to null when omitted", () => {
    const r = normalizeCheckInput(valid());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.counterAnchorDate).toBeNull();
  });

  test("accepts a valid ISO counterAnchorDate", () => {
    const r = normalizeCheckInput(valid({ counterAnchorDate: "2005-02-10" }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.counterAnchorDate).toBe("2005-02-10");
  });

  test("empty-string counterAnchorDate normalizes to null", () => {
    const r = normalizeCheckInput(valid({ counterAnchorDate: "" }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.counterAnchorDate).toBeNull();
  });

  test("rejects malformed counterAnchorDate", () => {
    const r = normalizeCheckInput(valid({ counterAnchorDate: "2005/02/10" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("counter_anchor_date_invalid");
  });

  test("rejects impossible-day counterAnchorDate", () => {
    const r = normalizeCheckInput(valid({ counterAnchorDate: "2025-02-30" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("counter_anchor_date_invalid");
  });
});
