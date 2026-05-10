import { z } from "zod";
import type { Tool } from "../registry";
import type { Storage } from "../../../storage/types";
import { durationToMs, persistReminder, type PersistResult } from "./shared";

const Schema = z.object({
  amount: z.number().int().positive().max(100_000),
  unit: z.enum(["minutes", "hours", "days"]),
  text: z.string().min(1).max(2000),
});

type Input = z.infer<typeof Schema>;

export function createScheduleReminderInTool(deps: {
  storage: Storage;
}): Tool<Input, PersistResult> {
  return {
    name: "schedule_reminder_in",
    description:
      "Schedule a reminder a relative duration from now (e.g. 'in 2 hours', 'in 3 days', 'tomorrow' = 24 hours). " +
      "Use when the user names a delay rather than a specific clock time. " +
      "Minimum lead time is 1 minute. The reminder text comes from the 'text' field; phrase it as the model's note to the user.",
    parameters: Schema,
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
