// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { z } from "zod";
import type { Tool } from "../registry";
import type { Storage } from "../../../storage/types";
import { REMINDER_WRITE_SOURCES } from "./shared";

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
      "Cancel a pending reminder by its id from list_reminders; one call per reminder. " +
      "{ cancelled: false } means nothing was cancelled — never tell the user it was.",
    parameters: Schema,
    sources: REMINDER_WRITE_SOURCES,
    execute: async ({ reminderId }, ctx) => {
      const scoped = deps.storage.forBot(ctx.botId ?? null);
      // O(1) fetch doubles as the ownership gate: reminders.delete itself does not
      // verify the owner, so we confirm the reminder is this user's before
      // removing it (and reuse fireAtMs for the confirmation blockquote).
      const reminder = await scoped.reminders.get(reminderId);
      if (!reminder || reminder.userId !== ctx.userId) {
        return { cancelled: false };
      }
      await scoped.reminders.delete(reminderId, ctx.userId);
      ctx.effects?.push({
        type: "reminder_cancelled",
        fireAtMs: reminder.fireAtMs,
        timezone: ctx.timezone,
      });
      return { cancelled: true };
    },
  };
}
