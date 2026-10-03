// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { z } from "zod";
import type { Tool } from "../registry";
import type { Storage } from "../../../storage/types";
import { REMINDER_TEXT_MAX_LEN } from "../../../reminders/types";
import { parseAbsoluteDateTimeMs } from "../../../shared/tz";
import {
  NOTE_DOC,
  PERSIST_RESULT_DOC,
  persistReminder,
  REMINDER_WRITE_SOURCES,
  type PersistResult,
} from "./shared";

const Schema = z.object({
  datetime: z
    .string()
    .describe("YYYY-MM-DDTHH:MM (24h) in the user's timezone."),
  text: z.string().min(1).max(REMINDER_TEXT_MAX_LEN),
});

type Input = z.infer<typeof Schema>;

export function createScheduleReminderAtTool(deps: {
  storage: Storage;
}): Tool<Input, PersistResult> {
  return {
    name: "schedule_reminder_at",
    description:
      "Schedule a one-off reminder at a wall-clock date and time ('May 20 at 6pm'); at least 1 minute ahead. " +
      `${NOTE_DOC} ${PERSIST_RESULT_DOC}`,
    parameters: Schema,
    sources: REMINDER_WRITE_SOURCES,
    execute: async ({ datetime, text }, ctx) => {
      const parsed = parseAbsoluteDateTimeMs(datetime, ctx.timezone);
      if (!parsed.ok) return { ok: false, reason: parsed.reason };
      return persistReminder(deps.storage, ctx, parsed.ms, text);
    },
  };
}
