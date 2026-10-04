// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type {
  CheckCounterMode,
  RecurringCheck,
  ValidationError,
} from "../../../../checks/types";
import { normalizeCheckInput } from "../../../../checks/validate";
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

// Each validation error: the draft field it is about and its group of rows.
const ERROR_INFO = {
  title_empty: { field: "title", group: "question" },
  question_empty: { field: "question", group: "question" },
  chat_id_empty: { field: "chatId", group: "recipient" },
  target_user_id_empty: { field: "targetUserId", group: "recipient" },
  target_name_empty: { field: "targetName", group: "recipient" },
  schedule_hour_invalid: { field: "scheduleHour", group: "schedule" },
  schedule_minute_invalid: { field: "scheduleMinute", group: "schedule" },
  timezone_invalid: { field: "timezone", group: "schedule" },
  timeout_minutes_invalid: { field: "timeoutMinutes", group: "schedule" },
  yes_button_empty: { field: "yesButton", group: "buttons" },
  no_button_empty: { field: "noButton", group: "buttons" },
  yes_reply_empty: { field: "yesReply", group: "replies" },
  no_reply_empty: { field: "noReply", group: "replies" },
  counter_invalid: { field: "counter", group: "counter" },
  counter_mode_invalid: { field: "counterMode", group: "counter" },
  counter_anchor_date_invalid: { field: "counterAnchorDate", group: "counter" },
} as const satisfies Record<
  ValidationError,
  { field: keyof CheckDraft; group: string }
>;

// What a change to the form comes to. `draft` is the form to show: a field the
// server would refuse goes back to its `saved` value, so one bad field never
// blocks the others (a new check, with no `saved`, keeps it as typed). `error`
// is the first refusal; `payload` the whole form to send, or null for nothing.
export type SavePlan = {
  draft: CheckDraft;
  error: ValidationError | null;
  payload: CheckDraft | null;
};

export function planSave(
  draft: CheckDraft,
  saved: CheckDraft | null,
): SavePlan {
  let next = draft;
  let error: ValidationError | null = null;
  for (;;) {
    const parsed = normalizeCheckInput(next);
    if (parsed.ok) {
      const same =
        saved !== null &&
        (Object.keys(saved) as (keyof CheckDraft)[]).every(
          (k) => parsed.value[k] === saved[k],
        );
      return { draft: next, error, payload: same ? null : parsed.value };
    }
    error ??= parsed.error;
    const { field } = ERROR_INFO[parsed.error];
    // Nothing left to put back (a new check, or a saved one already invalid).
    if (saved === null || next[field] === saved[field]) {
      return { draft: next, error, payload: null };
    }
    next = { ...next, [field]: saved[field] };
  }
}

// `draft` after the `failed` payload was rejected: the fields it changed go back
// to `saved`, other edits stay. A request queued behind it carries the whole
// form again and may still go through, after which the form matches the server.
export function revertDraft(
  draft: CheckDraft,
  saved: CheckDraft,
  failed: CheckDraft,
): CheckDraft {
  return Object.fromEntries(
    (Object.keys(draft) as (keyof CheckDraft)[]).map((k) => [
      k,
      failed[k] !== saved[k] ? saved[k] : draft[k],
    ]),
  ) as CheckDraft;
}

// `form` with the counter (and its start date) the server holds for `check`,
// unless the admin has edited them and that is not saved yet: the runner moves
// the counter on its own, and a whole-form save would write a stale one back.
export function withServerCounter(
  form: CheckDraft,
  check: RecurringCheck,
  edited: boolean,
): CheckDraft {
  if (edited) return form;
  return {
    ...form,
    counter: check.counter,
    counterAnchorDate: check.counterAnchorDate ?? null,
  };
}
