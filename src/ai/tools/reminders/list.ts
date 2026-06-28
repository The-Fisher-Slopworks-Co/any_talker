// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { z } from "zod";
import type { Tool } from "../registry";
import type { Storage } from "../../../storage/types";

// Defensive caps independent of the per-user creation cap: even if an admin
// raises maxRemindersPerUser, a single list result can never balloon the model
// context. Nothing downstream bounds a tool result before it re-enters the LLM,
// so the bound has to live here.
const LIST_REMINDERS_LIMIT = 50;
const NOTE_PREVIEW_MAX = 120;

const Schema = z.object({});
type Input = z.infer<typeof Schema>;

export type ListRemindersOutput = {
  reminders: Array<{ id: string; fireAt: string; note: string }>;
  total: number;
  truncated: boolean;
};

function previewNote(text: string): string {
  // Slice on code points, not UTF-16 units, so an emoji at the boundary is
  // never cut into a lone surrogate sitting before the ellipsis.
  const cps = [...text];
  if (cps.length <= NOTE_PREVIEW_MAX) return text;
  return cps.slice(0, NOTE_PREVIEW_MAX - 1).join("") + "…";
}

export function createListRemindersTool(deps: {
  storage: Storage;
}): Tool<Input, ListRemindersOutput> {
  return {
    name: "list_reminders",
    description:
      "List the current user's pending reminders in THIS chat, soonest first. Takes no parameters. " +
      "Returns { reminders: [{ id, fireAt (ISO 8601 UTC), note }], total, truncated }, where " +
      "'note' is the private reminder note (possibly shortened). " +
      "At most " +
      String(LIST_REMINDERS_LIMIT) +
      " reminders are returned; 'total' is the real count and 'truncated' is true when more exist than were returned. " +
      "The 'id' is an INTERNAL handle, used only to pass to cancel_reminder — NEVER show it to the user. " +
      "When telling the user about their reminders, describe each by what it is about and when it fires, never by its id. " +
      "Call this to show the user their reminders or to find which one to cancel.",
    parameters: Schema,
    execute: async (_input, ctx) => {
      const stored = await deps.storage
        .forBot(ctx.botId ?? null)
        .listRemindersForUser(ctx.userId);
      // Scope to the chat this turn runs in: a user's reminders are stored
      // per-user (one due-index across all their chats), but each reminder
      // records the chat it was created in. Showing reminders from other chats
      // here would leak one chat's private notes into another, so filter to the
      // current chat. listRemindersForUser already returns soonest-first, and
      // filtering preserves that order.
      const all = stored.filter((r) => r.chatId === ctx.chatId);
      const shown = all.slice(0, LIST_REMINDERS_LIMIT);
      return {
        reminders: shown.map((r) => ({
          id: r.id,
          fireAt: new Date(r.fireAtMs).toISOString(),
          note: previewNote(r.text),
        })),
        total: all.length,
        truncated: all.length > shown.length,
      };
    },
  };
}
