// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { z } from "zod";
import type { Tool, ToolCallContext } from "../registry";
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
  durationToMs,
  NOTE_DOC,
  PERSIST_RESULT_DOC,
  persistReminder,
  REMINDER_WRITE_SOURCES,
  type PersistResult,
} from "./shared";

// One tool for every way to create a reminder: a delay from now, a wall-clock
// time, or a repeating series. The time fields mirror edit_reminder's, so the
// model sees one vocabulary across both tools.
const Schema = z
  .object({
    text: z.string().min(1).max(REMINDER_TEXT_MAX_LEN),
    inAmount: z.number().int().positive().max(100_000).optional(),
    inUnit: z.enum(["minutes", "hours", "days"]).optional(),
    atDatetime: z
      .string()
      .optional()
      .describe(
        "YYYY-MM-DDTHH:MM (24h) in the user's timezone; for a series, its first occurrence.",
      ),
    everyAmount: z.number().int().positive().max(1000).optional(),
    everyUnit: z.enum(["minutes", "hours", "days", "weeks"]).optional(),
  })
  .refine((v) => (v.inAmount === undefined) === (v.inUnit === undefined), {
    message: "inAmount and inUnit go together — pass both or neither",
  })
  .refine(
    (v) => (v.everyAmount === undefined) === (v.everyUnit === undefined),
    { message: "everyAmount and everyUnit go together — pass both or neither" },
  )
  .refine((v) => v.inAmount === undefined || v.atDatetime === undefined, {
    message: "pass either inAmount + inUnit or atDatetime, not both",
  })
  .refine((v) => v.inAmount === undefined || v.everyAmount === undefined, {
    message:
      "a series starts at atDatetime or one interval from now; inAmount does not apply",
  })
  .refine(
    (v) =>
      v.inAmount !== undefined ||
      v.atDatetime !== undefined ||
      v.everyAmount !== undefined,
    {
      message:
        "provide a time: inAmount + inUnit, atDatetime, or everyAmount + everyUnit",
    },
  );

type Input = z.infer<typeof Schema>;
type RepeatUnit = NonNullable<Input["everyUnit"]>;

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

function intervalMs(amount: number, unit: RepeatUnit): number {
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

async function scheduleRecurring(
  storage: Storage,
  ctx: ToolCallContext,
  amount: number,
  unit: RepeatUnit,
  startAt: string | undefined,
  text: string,
): Promise<PersistResult> {
  const everyMs = intervalMs(amount, unit);
  if (everyMs < MIN_RECURRENCE_INTERVAL_MS) {
    return {
      ok: false,
      reason: `interval too short: a recurring reminder must repeat at most every ${MIN_RECURRENCE_INTERVAL_MS / MINUTE_MS} minutes; tell the user the shortest supported interval and offer it`,
    };
  }

  // No start means "from now": the first fire is one whole interval away,
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

  return persistReminder(storage, ctx, firstFireAtMs, text, {
    spec,
    occurrencesLeft: MAX_REMINDER_OCCURRENCES,
    occurrencesTotal: MAX_REMINDER_OCCURRENCES,
  });
}

export function createScheduleReminderTool(deps: {
  storage: Storage;
}): Tool<Input, PersistResult> {
  return {
    name: "schedule_reminder",
    description:
      "Schedule a reminder at least 1 minute ahead. " +
      "A bare 'remind me' takes its subject and time from the thread (e.g. a reply to your answer about a date): schedule it, ask ONLY what the thread leaves ambiguous. " +
      "One-off: inAmount + inUnit for a delay ('in 2 hours', 'tomorrow' = 1 day) OR atDatetime for a wall-clock time. " +
      "Repeating: everyAmount + everyUnit, a FIXED interval of at least 5 minutes, with atDatetime as the first occurrence or omitted to start one interval from now " +
      "('every day at 18:30' → every 1 day, atDatetime the next 18:30). " +
      "Calendar rules ('every weekday', 'first Monday of the month', cron) are NOT supported: do not approximate, offer the nearest fixed interval. " +
      `A series ends after ${MAX_REMINDER_OCCURRENCES} occurrences — say so when confirming — and counts as one reminder toward the limit. ` +
      `${NOTE_DOC} ${PERSIST_RESULT_DOC}`,
    parameters: Schema,
    sources: REMINDER_WRITE_SOURCES,
    execute: async (input, ctx) => {
      const { text } = input;
      if (input.everyAmount !== undefined && input.everyUnit !== undefined) {
        return scheduleRecurring(
          deps.storage,
          ctx,
          input.everyAmount,
          input.everyUnit,
          input.atDatetime,
          text,
        );
      }
      if (input.inAmount !== undefined && input.inUnit !== undefined) {
        return persistReminder(
          deps.storage,
          ctx,
          ctx.now + durationToMs(input.inAmount, input.inUnit),
          text,
        );
      }
      // The schema guarantees a time, so the remaining case is atDatetime.
      const parsed = parseAbsoluteDateTimeMs(
        input.atDatetime ?? "",
        ctx.timezone,
      );
      if (!parsed.ok) return { ok: false, reason: parsed.reason };
      return persistReminder(deps.storage, ctx, parsed.ms, text);
    },
  };
}
