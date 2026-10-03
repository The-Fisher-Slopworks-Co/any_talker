// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { z } from "zod";
import type { Tool } from "../registry";
import type { Storage } from "../../../storage/types";
import { MIN_LEAD_MS, REMINDER_TEXT_MAX_LEN } from "../../../reminders/types";
import { parseAbsoluteDateTimeMs } from "../../../shared/tz";
import {
  durationToMs,
  FAILED_WRITE_RULE,
  formatFireAt,
  NOTE_DOC,
  REMINDER_WRITE_SOURCES,
  tooSoonReason,
} from "./shared";

// The new fire time is flat top-level fields rather than a nested object:
// models kept sending a nested one as a JSON-encoded string, which failed
// validation several times before a single edit went through. Two mutually
// exclusive ways mirror the create tools: relative (inAmount + inUnit, "in 2
// hours") or absolute (atDatetime, "at 2026-08-01 09:00" in the user's
// timezone). Omit all three to keep the existing time.
const Schema = z
  .object({
    reminderId: z.string().min(1).max(100),
    // New private note; omit to keep the existing one.
    text: z.string().min(1).max(REMINDER_TEXT_MAX_LEN).optional(),
    inAmount: z.number().int().positive().max(100_000).optional(),
    inUnit: z.enum(["minutes", "hours", "days"]).optional(),
    atDatetime: z
      .string()
      .optional()
      .describe("YYYY-MM-DDTHH:MM (24h) in the user's timezone."),
  })
  .refine((v) => (v.inAmount === undefined) === (v.inUnit === undefined), {
    message: "inAmount and inUnit go together — pass both or neither",
  })
  .refine((v) => v.inAmount === undefined || v.atDatetime === undefined, {
    message: "pass either inAmount + inUnit or atDatetime, not both",
  })
  .refine(
    (v) =>
      v.text !== undefined ||
      v.inAmount !== undefined ||
      v.atDatetime !== undefined,
    {
      message:
        "provide a new text and/or a new time (inAmount + inUnit, or atDatetime) — at least one must change",
    },
  );

type Input = z.infer<typeof Schema>;

export type EditReminderOutput =
  { ok: true; fireAt: string } | { ok: false; reason: string };

export function createEditReminderTool(deps: {
  storage: Storage;
}): Tool<Input, EditReminderOutput> {
  return {
    name: "edit_reminder",
    description:
      "Change a pending reminder's note, time, or both; take its id from list_reminders. " +
      "New time: EITHER inAmount + inUnit (delay from now) OR atDatetime; at least 1 minute ahead. " +
      `${NOTE_DOC} ` +
      "Returns { ok: true, fireAt } or { ok: false, reason }. " +
      FAILED_WRITE_RULE,
    parameters: Schema,
    sources: REMINDER_WRITE_SOURCES,
    execute: async (
      { reminderId, text, inAmount, inUnit, atDatetime },
      ctx,
    ) => {
      const scoped = deps.storage.forBot(ctx.botId ?? null);
      // O(1) fetch doubles as the ownership gate, exactly as cancel_reminder:
      // reminders.save overwrites by id and does not verify the owner, so confirm
      // the reminder is this user's before mutating it.
      const reminder = await scoped.reminders.get(reminderId);
      if (!reminder || reminder.userId !== ctx.userId) {
        return { ok: false, reason: "no such reminder belongs to the user" };
      }

      // Only re-validate the lead time when the time actually changes: a
      // note-only edit must not be rejected just because the existing reminder
      // is already close to firing.
      let fireAtMs = reminder.fireAtMs;
      if (inAmount !== undefined || atDatetime !== undefined) {
        if (inAmount !== undefined && inUnit !== undefined) {
          fireAtMs = ctx.now + durationToMs(inAmount, inUnit);
        } else if (atDatetime !== undefined) {
          const parsed = parseAbsoluteDateTimeMs(atDatetime, ctx.timezone);
          if (!parsed.ok) return { ok: false, reason: parsed.reason };
          fireAtMs = parsed.ms;
        }
        if (fireAtMs - ctx.now < MIN_LEAD_MS) {
          return { ok: false, reason: tooSoonReason(fireAtMs, ctx) };
        }
      }

      // Spread the stored reminder so id, userId, chatId, lang, target,
      // createdAtMs and the original contextMessages snapshot are preserved;
      // only the note and/or fire time change.
      await scoped.reminders.save({
        ...reminder,
        text: text ?? reminder.text,
        fireAtMs,
      });

      ctx.effects?.push({
        type: "reminder_updated",
        fireAtMs,
        timezone: ctx.timezone,
      });

      return { ok: true, fireAt: formatFireAt(fireAtMs, ctx.timezone) };
    },
  };
}
