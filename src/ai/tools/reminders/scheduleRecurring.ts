// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { z } from "zod";
import type { Tool } from "../registry";
import type { Storage } from "../../../storage/types";
import type { RecurrenceSpec } from "../../../reminders/types";
import {
  MAX_REMINDER_OCCURRENCES,
  MIN_RECURRENCE_INTERVAL_MS,
  REMINDER_TEXT_MAX_LEN,
} from "../../../reminders/types";
import { formatLocalParts, parseAbsoluteDateTimeMs } from "../../../shared/tz";
import { isValidTimezone } from "../../../shared/types";
import {
  persistReminder,
  REMINDER_WRITE_SOURCES,
  type PersistResult,
} from "./shared";

const Schema = z.object({
  amount: z.number().int().positive().max(1000),
  unit: z.enum(["minutes", "hours", "days", "weeks"]),
  startAt: z
    .string()
    .optional()
    .describe(
      "First occurrence as a wall-clock datetime in the user's timezone, YYYY-MM-DDTHH:MM (24h, no seconds, no offset). Omit to start one interval from now.",
    ),
  text: z.string().min(1).max(REMINDER_TEXT_MAX_LEN),
});

type Input = z.infer<typeof Schema>;

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

function intervalMs(amount: number, unit: Input["unit"]): number {
  switch (unit) {
    case "minutes":
      return amount * MINUTE_MS;
    case "hours":
      return amount * 60 * MINUTE_MS;
    case "days":
      return amount * DAY_MS;
    case "weeks":
      return amount * 7 * DAY_MS;
  }
}

export function createScheduleRecurringReminderTool(deps: {
  storage: Storage;
}): Tool<Input, PersistResult> {
  return {
    name: "schedule_recurring_reminder",
    description:
      "Schedule a reminder that repeats on a FIXED interval: every N minutes, hours, days or weeks. " +
      "Use for 'every day at 18:30' (amount 1, unit 'days', startAt today or tomorrow at 18:30), " +
      "'every 20 minutes' (amount 20, unit 'minutes', no startAt), " +
      "'every two weeks starting 18 September' (amount 2, unit 'weeks', startAt that date). " +
      "'startAt' is the FIRST occurrence in the user's timezone and must be in the future; omit it to start one interval from now. " +
      "Only fixed intervals are supported. Calendar rules — 'every weekday', 'the first Monday of the month', 'every other Tuesday except holidays', cron expressions — are NOT supported: " +
      "do not approximate them, tell the user what is supported and offer the nearest fixed interval instead. " +
      "The interval must be at least 5 minutes, and the series fires at most " +
      String(MAX_REMINDER_OCCURRENCES) +
      " times before it ends — say so when confirming, and use schedule_reminder_in / schedule_reminder_at for a one-off. " +
      "The whole series counts as ONE reminder against the user's reminder limit. " +
      "The 'text' field is a private note to yourself describing what to remind about — on each occurrence you'll receive it as a system event and compose the actual user-facing message then.",
    parameters: Schema,
    sources: REMINDER_WRITE_SOURCES,
    execute: async ({ amount, unit, startAt, text }, ctx) => {
      const everyMs = intervalMs(amount, unit);
      if (everyMs < MIN_RECURRENCE_INTERVAL_MS) {
        return {
          ok: false,
          reason: `interval too short: a recurring reminder must repeat at most every ${MIN_RECURRENCE_INTERVAL_MS / MINUTE_MS} minutes; tell the user the shortest supported interval and offer it`,
        };
      }

      // No startAt means "from now": the first fire is one whole interval away,
      // which is also what anchors a daily series to the current wall clock.
      let firstFireAtMs = ctx.now + everyMs;
      if (startAt !== undefined) {
        const parsed = parseAbsoluteDateTimeMs(startAt, ctx.timezone);
        if (!parsed.ok) return { ok: false, reason: parsed.reason };
        firstFireAtMs = parsed.ms;
      }

      // Days and weeks repeat on the wall clock so a DST shift moves the
      // spacing rather than the time of day; shorter units repeat on elapsed
      // time, where the spacing is the whole point.
      let spec: RecurrenceSpec;
      if (unit === "days" || unit === "weeks") {
        if (!isValidTimezone(ctx.timezone)) {
          return { ok: false, reason: `invalid timezone: ${ctx.timezone}` };
        }
        const local = formatLocalParts(firstFireAtMs, ctx.timezone);
        spec = {
          kind: "calendar",
          everyDays: unit === "weeks" ? amount * 7 : amount,
          hour: local.hour,
          minute: local.minute,
          timezone: ctx.timezone,
        };
      } else {
        spec = { kind: "interval", everyMs };
      }

      return persistReminder(deps.storage, ctx, firstFireAtMs, text, {
        spec,
        occurrencesLeft: MAX_REMINDER_OCCURRENCES,
        occurrencesTotal: MAX_REMINDER_OCCURRENCES,
      });
    },
  };
}
