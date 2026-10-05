// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import type { RecurringCheck } from "../../../../checks/types";
import {
  anchorForSource,
  DEFAULT_DRAFT,
  formatAnchorDate,
  formatClock,
  parseClock,
  planSave,
  revertDraft,
  withServerCounter,
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

describe("check editor autosave plan", () => {
  const saved = {
    ...DEFAULT_DRAFT,
    title: "Sport",
    chatId: "-100",
    targetUserId: "1",
    targetName: "Nik",
  };

  test("sends the whole form, as the server will keep it", () => {
    const plan = planSave({ ...saved, title: "  Gym  " }, saved);
    expect(plan.error).toBeNull();
    expect(plan.payload).toEqual({ ...saved, title: "Gym" });
  });

  test("sends nothing when the form equals the saved check", () => {
    expect(planSave(saved, saved).payload).toBeNull();
    // Surrounding blanks are not a change: the server trims them.
    expect(planSave({ ...saved, title: "Sport " }, saved).payload).toBeNull();
  });

  test("toggle off then on before the response: the on state is sent", () => {
    // `saved` is what the server last answered (on); "off" has been sent since.
    const sentOff = { ...saved, enabled: false };
    expect(planSave(saved, saved).payload).toBeNull();
    expect(planSave(saved, sentOff).payload).toEqual(saved);
  });

  test("a refused field goes back, so it blocks nothing else", () => {
    // Chat ID cleared: put back, error reported, nothing to send.
    const first = planSave({ ...saved, chatId: " " }, saved);
    expect(first).toEqual({
      draft: saved,
      error: "chat_id_empty",
      payload: null,
    });
    // Then another field changes: that one is saved.
    const second = planSave({ ...first.draft, enabled: false }, saved);
    expect(second.error).toBeNull();
    expect(second.payload).toEqual({ ...saved, enabled: false });
  });

  test("a change made together with a refused one is still saved", () => {
    const plan = planSave({ ...saved, chatId: "", enabled: false }, saved);
    expect(plan.error).toBe("chat_id_empty");
    expect(plan.draft).toEqual({ ...saved, enabled: false });
    expect(plan.payload).toEqual({ ...saved, enabled: false });
  });

  test("reports the first of several refused fields", () => {
    const plan = planSave(
      { ...saved, title: "", timeoutMinutes: 0, enabled: false },
      saved,
    );
    expect(plan.error).toBe("title_empty");
    expect(plan.draft).toEqual({ ...saved, enabled: false });
  });

  test("a new check has nothing to go back to, so a bad form stays as typed", () => {
    const plan = planSave(DEFAULT_DRAFT, null);
    expect(plan).toEqual({
      draft: DEFAULT_DRAFT,
      error: "title_empty",
      payload: null,
    });
    expect(planSave(saved, null).payload).toEqual(saved);
  });

  test("a saved check that is itself invalid does not loop", () => {
    const plan = planSave(
      { ...saved, title: "", enabled: false },
      {
        ...saved,
        title: "",
      },
    );
    expect(plan.error).toBe("title_empty");
    expect(plan.payload).toBeNull();
  });

  test("a rejected save puts back only the fields it changed", () => {
    const failed = { ...saved, title: "Bad", enabled: false };
    // Typed since: a new question.
    const draft = { ...failed, question: "New?" };
    expect(revertDraft(draft, saved, failed)).toEqual({
      ...saved,
      question: "New?",
    });
  });
});

describe("check editor counter", () => {
  const form = { ...DEFAULT_DRAFT, counter: 3, counterAnchorDate: null };
  // The runner has since moved the counter to 9 and set a start date.
  const check = {
    counter: 9,
    counterAnchorDate: "2026-10-01",
  } as RecurringCheck;

  test("a counter nobody is editing is the one the server holds", () => {
    expect(withServerCounter(form, check, false)).toEqual({
      ...form,
      counter: 9,
      counterAnchorDate: "2026-10-01",
    });
  });

  test("a counter edited and not yet saved is sent as edited", () => {
    expect(withServerCounter(form, check, true)).toBe(form);
  });

  test("a check with no start date has none", () => {
    const plain = { counter: 4 } as RecurringCheck;
    expect(withServerCounter(form, plain, false).counterAnchorDate).toBeNull();
  });
});
