// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { applyAnswer, currentCount, isValidAnchorDate } from "./counter";
import type { RecurringCheck } from "./types";

function makeCheck(over: Partial<RecurringCheck> = {}): RecurringCheck {
  return {
    id: "c1",
    title: "Sport",
    chatId: "chat-1",
    targetUserId: "user-1",
    targetName: "Nikita",
    scheduleHour: 23,
    scheduleMinute: 30,
    timezone: "UTC",
    question: "{name} {count}",
    yesButton: "Y",
    noButton: "N",
    yesReply: "y {count}",
    noReply: "n {count}",
    timeoutMinutes: 25,
    counter: 0,
    counterMode: "always_increment",
    counterAnchorDate: null,
    enabled: true,
    lastFiredAtMs: 0,
    pendingMessageId: null,
    pendingFiredAtMs: null,
    createdAtMs: 0,
    ...over,
  };
}

const utcMs = (y: number, mo: number, d: number, h = 0, mn = 0) =>
  Date.UTC(y, mo - 1, d, h, mn);

describe("isValidAnchorDate", () => {
  test("accepts YYYY-MM-DD", () => {
    expect(isValidAnchorDate("2005-02-10")).toBe(true);
    expect(isValidAnchorDate("1999-12-31")).toBe(true);
  });
  test("rejects bad shape", () => {
    expect(isValidAnchorDate("2005-2-10")).toBe(false);
    expect(isValidAnchorDate("2005/02/10")).toBe(false);
    expect(isValidAnchorDate("")).toBe(false);
    expect(isValidAnchorDate(null)).toBe(false);
    expect(isValidAnchorDate(20050210)).toBe(false);
  });
  test("rejects impossible calendar dates", () => {
    expect(isValidAnchorDate("2025-02-30")).toBe(false);
    expect(isValidAnchorDate("2025-13-01")).toBe(false);
    expect(isValidAnchorDate("2025-00-15")).toBe(false);
    expect(isValidAnchorDate("2025-01-32")).toBe(false);
  });
});

describe("currentCount", () => {
  test("number mode: returns stored counter", () => {
    expect(currentCount(makeCheck({ counter: 7 }), utcMs(2026, 5, 11))).toBe(7);
  });

  test("date mode: returns days since anchor in the check's timezone", () => {
    const days = currentCount(
      makeCheck({ counterAnchorDate: "2005-02-10", timezone: "UTC" }),
      utcMs(2005, 2, 20, 12, 0),
    );
    expect(days).toBe(10);
  });

  test("date mode: anchor==today returns 0", () => {
    expect(
      currentCount(
        makeCheck({ counterAnchorDate: "2026-05-11", timezone: "UTC" }),
        utcMs(2026, 5, 11, 12, 0),
      ),
    ).toBe(0);
  });

  test("date mode: timezone shifts day boundary", () => {
    // 2026-05-11 22:00 UTC = 2026-05-12 01:00 Moscow
    const checkMsk = makeCheck({
      counterAnchorDate: "2026-05-11",
      timezone: "Europe/Moscow",
    });
    expect(currentCount(checkMsk, utcMs(2026, 5, 11, 22, 0))).toBe(1);
    const checkUtc = makeCheck({
      counterAnchorDate: "2026-05-11",
      timezone: "UTC",
    });
    expect(currentCount(checkUtc, utcMs(2026, 5, 11, 22, 0))).toBe(0);
  });

  test("date mode: future anchor clamps to 0 rather than going negative", () => {
    expect(
      currentCount(
        makeCheck({ counterAnchorDate: "2030-01-01", timezone: "UTC" }),
        utcMs(2026, 5, 11),
      ),
    ).toBe(0);
  });
});

describe("applyAnswer", () => {
  test("number mode + no: counter++ and stored", () => {
    const out = applyAnswer(
      makeCheck({ counter: 10 }),
      "no",
      utcMs(2026, 5, 11),
    );
    expect(out).toEqual({
      replyCount: 11,
      patch: { counter: 11, counterAnchorDate: null },
    });
  });

  test("number mode + yes + always_increment: counter++", () => {
    const out = applyAnswer(
      makeCheck({ counter: 10, counterMode: "always_increment" }),
      "yes",
      utcMs(2026, 5, 11),
    );
    expect(out.replyCount).toBe(11);
    expect(out.patch.counter).toBe(11);
  });

  test("number mode + yes + reset_on_yes: counter = 0", () => {
    const out = applyAnswer(
      makeCheck({ counter: 10, counterMode: "reset_on_yes" }),
      "yes",
      utcMs(2026, 5, 11),
    );
    expect(out).toEqual({
      replyCount: 0,
      patch: { counter: 0, counterAnchorDate: null },
    });
  });

  test("date mode + no: anchor unchanged, replyCount is days since anchor", () => {
    const out = applyAnswer(
      makeCheck({ counterAnchorDate: "2005-02-10", timezone: "UTC" }),
      "no",
      utcMs(2005, 2, 20),
    );
    expect(out).toEqual({
      replyCount: 10,
      patch: { counter: 0, counterAnchorDate: "2005-02-10" },
    });
  });

  test("date mode + yes + always_increment: anchor unchanged", () => {
    const out = applyAnswer(
      makeCheck({
        counterAnchorDate: "2005-02-10",
        timezone: "UTC",
        counterMode: "always_increment",
      }),
      "yes",
      utcMs(2005, 2, 20),
    );
    expect(out.replyCount).toBe(10);
    expect(out.patch.counterAnchorDate).toBe("2005-02-10");
  });

  test("date mode + yes + reset_on_yes: anchor moves to today in check tz", () => {
    const out = applyAnswer(
      makeCheck({
        counterAnchorDate: "2005-02-10",
        timezone: "Europe/Moscow",
        counterMode: "reset_on_yes",
      }),
      "yes",
      utcMs(2026, 5, 11, 22, 0), // 2026-05-12 in MSK
    );
    expect(out).toEqual({
      replyCount: 0,
      patch: { counter: 0, counterAnchorDate: "2026-05-12" },
    });
  });

  test("date mode + timeout: behaves like no", () => {
    const out = applyAnswer(
      makeCheck({
        counterAnchorDate: "2005-02-10",
        timezone: "UTC",
        counterMode: "reset_on_yes",
      }),
      "timeout",
      utcMs(2005, 2, 20),
    );
    expect(out.replyCount).toBe(10);
    expect(out.patch.counterAnchorDate).toBe("2005-02-10");
  });
});
