// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { z } from "zod";
import type { Tool } from "../registry";
import type { Storage } from "../../../storage/types";
import { formatFireAt } from "./shared";

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
      "List the user's pending reminders, soonest first: in a group only this chat's, in a private chat all of them. " +
      "Returns { reminders: [{ id, fireAt (YYYY-MM-DDTHH:MM, user's timezone), note }], total, truncated }, at most " +
      String(LIST_REMINDERS_LIMIT) +
      " entries. Use it to show reminders or to find the id to edit or cancel.",
    parameters: Schema,
    execute: async (_input, ctx) => {
      const stored = await deps.storage
        .forBot(ctx.botId ?? null)
        .reminders.listForUser(ctx.userId);
      // Reminders are stored per-user (one due-index across all of a user's
      // chats), but each records the chat it was created in. In a group (or
      // business) chat, listing reminders created elsewhere would leak one
      // chat's private notes into another, so scope to the current chat. In the
      // user's private DM (chatId === the userId) there is no other audience,
      // and the DM is the natural place to manage the whole list — including
      // guest-DM reminders, which are delivered there but recorded against the
      // business chat they were created in, and reminders whose chat id changed
      // under them (e.g. a group upgraded to a supergroup). So in the DM return
      // everything. Either way reminders.listForUser returns soonest-first, and
      // filtering preserves that order.
      const inPrivateDm = ctx.chatId === ctx.userId;
      const all = inPrivateDm
        ? stored
        : stored.filter((r) => r.chatId === ctx.chatId);
      const shown = all.slice(0, LIST_REMINDERS_LIMIT);
      return {
        reminders: shown.map((r) => ({
          id: r.id,
          fireAt: formatFireAt(r.fireAtMs, ctx.timezone),
          note: previewNote(r.text),
        })),
        total: all.length,
        truncated: all.length > shown.length,
      };
    },
  };
}
