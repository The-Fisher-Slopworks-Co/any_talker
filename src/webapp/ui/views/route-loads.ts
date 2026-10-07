// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { Route } from "../lib/routes";
import type { Loadable } from "../lib/use-loadable";
import { adminSummaryLoad } from "./admin/admin-view";
import { adminSectionLoads } from "./admin/admin-section-view";
import { chatEditLoads } from "./admin/chat-edit-view";
import { checkEditLoads } from "./admin/check-edit-view";
import { feedbackReportLoad } from "./admin/feedback-view";
import { managedBotEditLoads } from "./admin/managed-bot-edit-view";
import { userEditLoads } from "./admin/user-edit-view";
import { myFactsLoads } from "./facts-view";
import { myRemindersLoad } from "./reminders-list";

// What a route's screen needs for its first full frame, taken from the screen's
// own loadables so the two stay the same.
export function routeLoads(route: Route): Loadable<unknown>[] {
  switch (route.kind) {
    case "main":
      return [];
    case "admin":
      return [adminSummaryLoad];
    case "admin-section":
      return adminSectionLoads(route.section);
    case "user-edit":
      return Object.values(userEditLoads(route.userId));
    case "chat-edit":
      return Object.values(chatEditLoads(route.chatId));
    case "check-edit":
      return Object.values(checkEditLoads(route.checkId));
    case "managed-bot-edit":
      return managedBotEditLoads(route.botId);
    case "feedback-view":
      return [feedbackReportLoad(route.feedbackId)];
    case "my-reminders":
      return [myRemindersLoad];
    case "my-facts":
      return Object.values(myFactsLoads());
  }
}
