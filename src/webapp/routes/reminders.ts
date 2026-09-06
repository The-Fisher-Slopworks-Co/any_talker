// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { Storage } from "../../storage/types";
import type { Chat, User } from "../../shared/types";
import { readValidDisplayName } from "../../shared/display-name";
import type { Reminder } from "../../reminders/types";
import type { ApiResponse, Route } from "./types";

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
];
