// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

// One client module per backend route module (`webapp/routes/*`), assembled here
// into the flat `api` object the views call. The names stay flat on purpose: a
// view asks for an endpoint, not for a domain.

import { accessApi } from "./access";
import { adminChatsApi } from "./admin-chats";
import { adminChecksApi } from "./admin-checks";
import { adminManagedBotsApi } from "./admin-managed-bots";
import { adminSpendApi } from "./admin-spend";
import { adminUsersApi } from "./admin-users";
import { buildInfoApi } from "./build-info";
import { meApi } from "./me";
import { rateLimitApi } from "./ratelimit";
import { remindersApi } from "./reminders";
import { settingsApi } from "./settings";

// Every response shape, re-exported so a view names one without knowing which
// module declares it. A `@public` statement carries a name no view imports
// today — this barrel is the client's surface, not a use site, so knip is told
// not to read the absence as dead code.
export type { MeResponse, UserFact, FactBot, FactsResponse } from "./me";
/** @public */
export type { SpendingResponse } from "./me";
export type { UserSettingsResponse } from "./admin-users";
/** @public */
export type { ChatSettingsResponse } from "./admin-chats";
export type { RemindersResponse } from "./reminders";
/** @public */
export type { QuarantinedRemindersResponse } from "./reminders";
export type { ManagedBotDetail } from "./admin-managed-bots";
/** @public */
export type { ManagedBotRow, ManagedBotNewInfo } from "./admin-managed-bots";
export type { BuildInfoResponse } from "./build-info";

// Pass-throughs, so a view types a response without reaching into the server
// tree for it.
export type { SpendSummary } from "../../../spending/window";
export type { UsageStatus } from "../../../ratelimit/window";
export type { UsageShare } from "../../../ratelimit/share";
/** @public */
export type { SpendOverview } from "../../../spending/overview";

export const api = {
  ...settingsApi,
  ...accessApi,
  ...rateLimitApi,
  ...meApi,
  ...remindersApi,
  ...adminUsersApi,
  ...adminChatsApi,
  ...adminSpendApi,
  ...adminChecksApi,
  ...adminManagedBotsApi,
  ...buildInfoApi,
};
