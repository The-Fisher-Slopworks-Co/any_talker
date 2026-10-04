// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type {
  CheckCounterMode,
  RecurringCheck,
} from "../../../../checks/types";
import { localDateString } from "../../../../shared/tz";

// What a brand-new check starts as. The wording is content the admin edits, not
// UI chrome, so it is not translated.
export const DEFAULT_DRAFT = {
  title: "",
  chatId: "",
  targetUserId: "",
  targetName: "",
  scheduleHour: 23,
  scheduleMinute: 30,
  timezone: "Europe/Moscow",
  question: "{name}, занялся ли ты сегодня спортом?",
  yesButton: "Да",
  noButton: "Нет",
  yesReply: "{name}, хотя бы себе не ври. День без спорта {count}",
  noReply: "{name}. День без спорта {count}",
  timeoutMinutes: 25,
  counter: 0,
  counterMode: "always_increment" as CheckCounterMode,
  counterAnchorDate: null as string | null,
  enabled: true,
};

export type CheckDraft = typeof DEFAULT_DRAFT;

export function checkToDraft(c: RecurringCheck): CheckDraft {
  return {
    title: c.title,
    chatId: c.chatId,
    targetUserId: c.targetUserId,
    targetName: c.targetName,
    scheduleHour: c.scheduleHour,
    scheduleMinute: c.scheduleMinute,
    timezone: c.timezone,
    question: c.question,
    yesButton: c.yesButton,
    noButton: c.noButton,
    yesReply: c.yesReply,
    noReply: c.noReply,
    timeoutMinutes: c.timeoutMinutes,
    counter: c.counter,
    counterMode: c.counterMode,
    counterAnchorDate: c.counterAnchorDate ?? null,
    enabled: c.enabled,
  };
}

// The schedule's time of day as the "HH:MM" a time input shows.
export function formatClock(hour: number, minute: number): string {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

// The hour and minute a time input holds, or null while it is cleared.
export function parseClock(
  text: string,
): { hour: number; minute: number } | null {
  const m = /^(\d{2}):(\d{2})/.exec(text);
  if (!m) return null;
  return { hour: Number(m[1]), minute: Number(m[2]) };
}

// The anchor date once the counter source is picked: none for a hand-kept
// counter; for the date source the date already there, else today (in the
// check's zone) so the second choice is never empty.
export function anchorForSource(
  byDate: boolean,
  current: string | null,
  timezone: string,
  nowMs: number = Date.now(),
): string | null {
  if (!byDate) return null;
  return current ?? localDateString(nowMs, timezone);
}

// The start date ("2026-01-02") as the viewer's language writes it.
export function formatAnchorDate(date: string, lang: string): string {
  return new Intl.DateTimeFormat(lang, {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}
