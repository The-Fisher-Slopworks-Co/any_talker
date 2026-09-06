// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { Chat, User } from "../../../shared/types";
import type { Reminder } from "../../../reminders/types";
import { req } from "./http";

// The admin listing carries every reminder and therefore the author lookups the
// own-reminders listing has no use for.
export type RemindersResponse = {
  reminders: Reminder[];
  chats: Record<string, Chat>;
  users?: Record<string, User>;
  displayNames?: Record<string, string | null>;
};

// `webapp/routes/reminders.ts`
export const remindersApi = {
  listMyReminders: () => req<RemindersResponse>("GET", "/api/me/reminders"),
  listAdminReminders: () =>
    req<RemindersResponse>("GET", "/api/admin/reminders"),
};
