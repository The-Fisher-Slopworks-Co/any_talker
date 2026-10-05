// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { getOrInitSettings } from "../../settings";
import type { AdminSummary } from "../../shared/types/admin-summary";
import type { Route } from "./types";

// The counts beside the admin home's rows. Each is the length of a list its
// own screen reads anyway, except the new-feedback tally, which is a cardinality
// of the status index.
export const adminSummaryRoutes: Route[] = [
  {
    method: "GET",
    path: "/api/admin/summary",
    handle: async ({ deps }) => {
      const { storage } = deps;
      const [
        settings,
        bots,
        users,
        chats,
        reminders,
        quarantined,
        checks,
        newFeedback,
        apiToken,
      ] = await Promise.all([
        getOrInitSettings(storage),
        storage.managedBots.list(),
        storage.users.list(),
        storage.chats.list(),
        storage.reminders.listAll(),
        storage.reminders.listQuarantined(),
        storage.checks.list(),
        storage.feedback.count("new"),
        storage.apiToken.get(),
      ]);
      const body: AdminSummary = {
        bots: bots.length,
        budgetEnabled: settings.budget.enabled,
        whitelistEnabled: settings.whitelistEnabled,
        users: users.length,
        chats: chats.length,
        reminders: reminders.length,
        quarantined: quarantined.length,
        checks: checks.length,
        newFeedback,
        apiTokenCreated: apiToken !== null,
      };
      return { status: 200, body };
    },
  },
];
