// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { z } from "zod";
import type { Tool } from "../registry";
import type { Storage } from "../../../storage/types";
import { parseAbsoluteDateTimeMs } from "../../../shared/tz";
import { persistReminder, type PersistResult } from "./shared";

const Schema = z.object({
  datetime: z
    .string()
    .describe(
      "Wall-clock datetime in the user's timezone, formatted as YYYY-MM-DDTHH:MM (24h, no seconds, no offset).",
    ),
  text: z.string().min(1).max(2000),
});

type Input = z.infer<typeof Schema>;

export function createScheduleReminderAtTool(deps: {
  storage: Storage;
}): Tool<Input, PersistResult> {
  return {
    name: "schedule_reminder_at",
    description:
      "Schedule a reminder at a specific wall-clock datetime in the user's timezone. " +
      "Use when the user names a date/time (e.g. 'May 20 at 6pm', '2026-08-01 09:00'). " +
      "Format the datetime as YYYY-MM-DDTHH:MM in the user's local timezone. " +
      "Minimum lead time is 1 minute. The 'text' field is a private note to yourself describing what to remind about — when the reminder fires, you'll receive it as a system event and compose the actual user-facing message then.",
    parameters: Schema,
    execute: async ({ datetime, text }, ctx) => {
      const parsed = parseAbsoluteDateTimeMs(datetime, ctx.timezone);
      if (!parsed.ok) return { ok: false, reason: parsed.reason };
      return persistReminder(deps.storage, ctx, parsed.ms, text);
    },
  };
}
