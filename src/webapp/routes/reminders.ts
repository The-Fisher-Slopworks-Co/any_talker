// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { Storage } from "../../storage/types";
import type { Chat, User } from "../../shared/types";
import { readValidDisplayName } from "../../shared/display-name";
import {
  MIN_LEAD_MS,
  REMINDER_TEXT_MAX_LEN,
  type Reminder,
} from "../../reminders/types";
import type { ApiResponse, Route } from "./types";

const REMINDER_NOT_FOUND: ApiResponse = {
  status: 404,
  body: { error: "reminder not found" },
};

// The admin edit: the note and/or the fire time, nothing else. Everything the
// delivery needs (target, lang, context snapshot, recurrence) stays as stored.
// As in `edit_reminder`, the lead time is only enforced when the time actually
// moves, so fixing the note of a reminder about to fire is not rejected.
function applyReminderPatch(
  body: unknown,
  existing: Reminder,
  nowMs: number,
): { ok: true; reminder: Reminder } | { ok: false; error: string } {
  if (typeof body !== "object" || body === null) {
    return { ok: false, error: "invalid_body" };
  }
  const { text, fireAtMs } = body as Record<string, unknown>;
  if (text === undefined && fireAtMs === undefined) {
    return { ok: false, error: "nothing_to_change" };
  }
  let nextText = existing.text;
  if (text !== undefined) {
    if (typeof text !== "string") return { ok: false, error: "invalid_text" };
    nextText = text.trim();
    if (nextText === "" || nextText.length > REMINDER_TEXT_MAX_LEN) {
      return { ok: false, error: "invalid_text" };
    }
  }
  let nextFireAtMs = existing.fireAtMs;
  if (fireAtMs !== undefined && fireAtMs !== existing.fireAtMs) {
    if (typeof fireAtMs !== "number" || !Number.isSafeInteger(fireAtMs)) {
      return { ok: false, error: "invalid_fire_at" };
    }
    if (fireAtMs - nowMs < MIN_LEAD_MS) {
      return { ok: false, error: "fire_at_too_soon" };
    }
    nextFireAtMs = fireAtMs;
  }
  return {
    ok: true,
    reminder: { ...existing, text: nextText, fireAtMs: nextFireAtMs },
  };
}

async function collectReminderChats(
  storage: Storage,
  reminders: Reminder[],
): Promise<Record<string, Chat>> {
  const ids = new Set<string>();
  for (const r of reminders) {
    if (r.target.kind === "ask_reply") ids.add(r.target.chatId);
  }
  if (ids.size === 0) return {};
  const entries = await Promise.all(
    [...ids].map(async (id) => [id, await storage.chats.get(id)] as const),
  );
  const out: Record<string, Chat> = {};
  for (const [id, chat] of entries) {
    if (chat) out[id] = chat;
  }
  return out;
}

async function collectReminderUsers(
  storage: Storage,
  reminders: Reminder[],
): Promise<{
  users: Record<string, User>;
  displayNames: Record<string, string | null>;
}> {
  const ids = new Set<string>(reminders.map((r) => r.userId));
  if (ids.size === 0) return { users: {}, displayNames: {} };
  const entries = await Promise.all(
    [...ids].map(
      async (id) =>
        [
          id,
          await storage.users.get(id),
          await readValidDisplayName(storage, id),
        ] as const,
    ),
  );
  const users: Record<string, User> = {};
  const displayNames: Record<string, string | null> = {};
  for (const [id, user, displayName] of entries) {
    if (user) users[id] = user;
    displayNames[id] = displayName;
  }
  return { users, displayNames };
}

async function respondMyReminders(
  storage: Storage,
  reminders: Reminder[],
): Promise<ApiResponse> {
  const chats = await collectReminderChats(storage, reminders);
  return { status: 200, body: { reminders, chats } };
}

async function respondAdminReminders(
  storage: Storage,
  reminders: Reminder[],
): Promise<ApiResponse> {
  const [chats, { users, displayNames }] = await Promise.all([
    collectReminderChats(storage, reminders),
    collectReminderUsers(storage, reminders),
  ]);
  return { status: 200, body: { reminders, chats, users, displayNames } };
}

export const meReminderRoutes: Route[] = [
  {
    method: "GET",
    path: "/api/me/reminders",
    handle: async ({ deps, actor }) =>
      respondMyReminders(
        deps.storage,
        await deps.storage.reminders.listForUser(actor.userId),
      ),
  },
];

export const adminReminderRoutes: Route[] = [
  {
    method: "GET",
    path: "/api/admin/reminders",
    handle: async ({ deps }) =>
      respondAdminReminders(
        deps.storage,
        await deps.storage.reminders.listAll(),
      ),
  },
  // Reminders the due path could not parse. Raw payloads, deliberately: the
  // point is to inspect what the parser rejected and replay it once fixed.
  {
    method: "GET",
    path: "/api/admin/reminders/quarantined",
    handle: async ({ deps }) => ({
      status: 200,
      body: { quarantined: await deps.storage.reminders.listQuarantined() },
    }),
  },
  // Only PATCH and DELETE take an id, so they cannot shadow the literal GET
  // above. Like the listing, they act on the main bot's scope.
  {
    method: "PATCH",
    path: /^\/api\/admin\/reminders\/([^/]+)$/,
    handle: async ({ req, deps, params }) => {
      const existing = await deps.storage.reminders.get(params[0]!);
      if (!existing) return REMINDER_NOT_FOUND;
      const patched = applyReminderPatch(req.body, existing, Date.now());
      if (!patched.ok) return { status: 400, body: { error: patched.error } };
      await deps.storage.reminders.save(patched.reminder);
      return { status: 200, body: { reminder: patched.reminder } };
    },
  },
  {
    method: "DELETE",
    path: /^\/api\/admin\/reminders\/([^/]+)$/,
    handle: async ({ deps, params }) => {
      // Fetched first: the store's delete needs the owner to clean their index.
      const existing = await deps.storage.reminders.get(params[0]!);
      if (!existing) return REMINDER_NOT_FOUND;
      await deps.storage.reminders.delete(existing.id, existing.userId);
      return { status: 200, body: { ok: true } };
    },
  },
];
