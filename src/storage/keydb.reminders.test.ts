// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { parseSaveReminderReply } from "./keydb/reminders";

describe("parseSaveReminderReply", () => {
  test("treats '1' / 1 as success", () => {
    expect(parseSaveReminderReply("1")).toEqual({ ok: true });
    expect(parseSaveReminderReply(1)).toEqual({ ok: true });
  });

  test("treats '0' / 0 as limit_reached", () => {
    expect(parseSaveReminderReply("0")).toEqual({
      ok: false,
      reason: "limit_reached",
    });
    expect(parseSaveReminderReply(0)).toEqual({
      ok: false,
      reason: "limit_reached",
    });
  });

  test("throws on an unexpected reply shape instead of faking a result", () => {
    for (const bad of [null, undefined, "", "2", 2, {}, [], Buffer.from("1")]) {
      expect(() => parseSaveReminderReply(bad)).toThrow(
        /Unexpected EVAL reply for reminders\.saveIfUnderCap/,
      );
    }
  });
});
