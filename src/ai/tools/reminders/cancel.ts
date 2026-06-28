// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { z } from "zod";
import type { Tool } from "../registry";
import type { Storage } from "../../../storage/types";

const Schema = z.object({
  reminderId: z.string().min(1).max(100),
});
type Input = z.infer<typeof Schema>;

export type CancelReminderOutput = { cancelled: boolean };

export function createCancelReminderTool(deps: {
  storage: Storage;
}): Tool<Input, CancelReminderOutput> {
  return {
    name: "cancel_reminder",
    description:
      "Cancel one of the current user's pending reminders by its id (get ids from list_reminders first). " +
      "The reminderId is an INTERNAL handle — never show it to the user or ask them for it; " +
      "figure out which reminder the user means yourself and pass its id. " +
      "Returns { cancelled: true } if the reminder existed and belonged to the user and was removed, " +
      "or { cancelled: false } if no such reminder is theirs (not an error). " +
      "To cancel several, call this once per id. There is no cancel-all.",
    parameters: Schema,
    execute: async ({ reminderId }, ctx) => {
      const scoped = deps.storage.forBot(ctx.botId ?? null);
      // O(1) fetch doubles as the ownership gate: deleteReminder itself does not
      // verify the owner, so we confirm the reminder is this user's before
      // removing it (and reuse fireAtMs for the confirmation blockquote).
      const reminder = await scoped.getReminder(reminderId);
      if (!reminder || reminder.userId !== ctx.userId) {
        return { cancelled: false };
      }
      await scoped.deleteReminder(reminderId, ctx.userId);
      ctx.effects?.push({
        type: "reminder_cancelled",
        fireAtMs: reminder.fireAtMs,
        timezone: ctx.timezone,
      });
      return { cancelled: true };
    },
  };
}
