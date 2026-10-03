// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { z } from "zod";
import type { Tool } from "../registry";
import type { Storage } from "../../../storage/types";
import { REMINDER_TEXT_MAX_LEN } from "../../../reminders/types";
import {
  durationToMs,
  NOTE_DOC,
  PERSIST_RESULT_DOC,
  persistReminder,
  REMINDER_WRITE_SOURCES,
  type PersistResult,
} from "./shared";

const Schema = z.object({
  amount: z.number().int().positive().max(100_000),
  unit: z.enum(["minutes", "hours", "days"]),
  text: z.string().min(1).max(REMINDER_TEXT_MAX_LEN),
});

type Input = z.infer<typeof Schema>;

export function createScheduleReminderInTool(deps: {
  storage: Storage;
}): Tool<Input, PersistResult> {
  return {
    name: "schedule_reminder_in",
    description:
      "Schedule a one-off reminder after a delay ('in 2 hours', 'tomorrow' = 1 day); at least 1 minute ahead. " +
      `${NOTE_DOC} ${PERSIST_RESULT_DOC}`,
    parameters: Schema,
    sources: REMINDER_WRITE_SOURCES,
    execute: async ({ amount, unit, text }, ctx) => {
      return persistReminder(
        deps.storage,
        ctx,
        ctx.now + durationToMs(amount, unit),
        text,
      );
    },
  };
}
