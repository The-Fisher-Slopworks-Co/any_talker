// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { z } from "zod";
import type { Tool } from "../registry";
import type { Storage } from "../../../storage/types";
import { MIN_LEAD_MS } from "../../../reminders/types";
import { parseAbsoluteDateTimeMs } from "../../../shared/tz";
import { durationToMs } from "./shared";

const Schema = z
  .object({
    reminderId: z.string().min(1).max(100),
    // New private note; omit to keep the existing one.
    text: z.string().min(1).max(2000).optional(),
    // New fire time; omit to keep the existing one. Two mutually exclusive
    // modes mirror the create tools: relative ("in 2 hours") or absolute
    // wall-clock datetime ("at 2026-08-01 09:00", in the user's timezone).
    newTime: z
      .discriminatedUnion("mode", [
        z.object({
          mode: z.literal("in"),
          amount: z.number().int().positive().max(100_000),
          unit: z.enum(["minutes", "hours", "days"]),
        }),
        z.object({
          mode: z.literal("at"),
          datetime: z
            .string()
            .describe(
              "Wall-clock datetime in the user's timezone, formatted as YYYY-MM-DDTHH:MM (24h, no seconds, no offset).",
            ),
        }),
      ])
      .optional(),
  })
  .refine((v) => v.text !== undefined || v.newTime !== undefined, {
    message: "provide a new text and/or newTime — at least one must change",
  });

type Input = z.infer<typeof Schema>;

export type EditReminderOutput =
  | { ok: true; fireAt: string }
  | { ok: false; reason: string };

export function createEditReminderTool(deps: {
  storage: Storage;
}): Tool<Input, EditReminderOutput> {
  return {
    name: "edit_reminder",
    description:
      "Edit one of the current user's pending reminders by its id (get ids from list_reminders first). " +
      "The reminderId is an INTERNAL handle — never show it to the user or ask them for it; " +
      "figure out which reminder the user means yourself and pass its id. " +
      "Change the private note ('text'), the fire time ('newTime'), or both — at least one is required. " +
      "'newTime' has two modes: { mode: 'in', amount, unit } for a delay from now, or " +
      "{ mode: 'at', datetime } for a specific wall-clock time (YYYY-MM-DDTHH:MM in the user's timezone). " +
      "Minimum lead time is 1 minute when changing the time. " +
      "Like the create tools, 'text' is a private note to yourself describing what to remind about — " +
      "the original conversation context is preserved, and when the reminder fires you'll compose the user-facing message then. " +
      "Returns { ok: true, fireAt } on success, or { ok: false, reason } if the reminder isn't theirs or the new time is invalid.",
    parameters: Schema,
    execute: async ({ reminderId, text, newTime }, ctx) => {
      const scoped = deps.storage.forBot(ctx.botId ?? null);
      // O(1) fetch doubles as the ownership gate, exactly as cancel_reminder:
      // saveReminder overwrites by id and does not verify the owner, so confirm
      // the reminder is this user's before mutating it.
      const reminder = await scoped.getReminder(reminderId);
      if (!reminder || reminder.userId !== ctx.userId) {
        return { ok: false, reason: "no such reminder belongs to the user" };
      }

      // Only re-validate the lead time when the time actually changes: a
      // note-only edit must not be rejected just because the existing reminder
      // is already close to firing.
      let fireAtMs = reminder.fireAtMs;
      if (newTime) {
        if (newTime.mode === "in") {
          fireAtMs = ctx.now + durationToMs(newTime.amount, newTime.unit);
        } else {
          const parsed = parseAbsoluteDateTimeMs(newTime.datetime, ctx.timezone);
          if (!parsed.ok) return { ok: false, reason: parsed.reason };
          fireAtMs = parsed.ms;
        }
        if (fireAtMs - ctx.now < MIN_LEAD_MS) {
          return {
            ok: false,
            reason: "reminder must fire at least 1 minute from now",
          };
        }
      }

      // Spread the stored reminder so id, userId, chatId, lang, target,
      // createdAtMs and the original contextMessages snapshot are preserved;
      // only the note and/or fire time change.
      await scoped.saveReminder({
        ...reminder,
        text: text ?? reminder.text,
        fireAtMs,
      });

      ctx.effects?.push({
        type: "reminder_updated",
        fireAtMs,
        timezone: ctx.timezone,
      });

      return { ok: true, fireAt: new Date(fireAtMs).toISOString() };
    },
  };
}
