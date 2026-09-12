// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { Chat, User } from "../../../shared/types";
import type { Reminder } from "../../../reminders/types";
import type { QuarantinedReminder } from "../../../storage/types/reminders";
import { req } from "./http";

// The admin listing carries every reminder and therefore the author lookups the
// own-reminders listing has no use for.
export type RemindersResponse = {
  reminders: Reminder[];
  chats: Record<string, Chat>;
  users?: Record<string, User>;
  displayNames?: Record<string, string | null>;
};

// Records the due path could not parse, newest first. No lookup tables come
// with them: a quarantined payload has no parsed `userId` to resolve against
// the user index — whatever can be recovered comes out of the blob itself.
export type QuarantinedRemindersResponse = {
  quarantined: QuarantinedReminder[];
};

// `webapp/routes/reminders.ts`
export const remindersApi = {
  listMyReminders: () => req<RemindersResponse>("GET", "/api/me/reminders"),
  listAdminReminders: () =>
    req<RemindersResponse>("GET", "/api/admin/reminders"),
  listQuarantinedReminders: () =>
    req<QuarantinedRemindersResponse>(
      "GET",
      "/api/admin/reminders/quarantined",
    ),
  updateAdminReminder: (
    id: string,
    patch: { text?: string; fireAtMs?: number },
  ) =>
    req<{ reminder: Reminder }>("PATCH", `/api/admin/reminders/${id}`, patch),
  deleteAdminReminder: (id: string) =>
    req<{ ok: true }>("DELETE", `/api/admin/reminders/${id}`),
};
