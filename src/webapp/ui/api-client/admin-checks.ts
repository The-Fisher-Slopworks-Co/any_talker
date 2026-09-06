// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { RecurringCheck } from "../../../checks/types";
import type { CheckInputFields } from "../../../checks/validate";
import { req } from "./http";

// `webapp/routes/admin-checks.ts`
export const adminChecksApi = {
  listChecks: () =>
    req<{ checks: RecurringCheck[] }>("GET", "/api/admin/checks"),
  getCheck: (id: string) =>
    req<{ check: RecurringCheck }>("GET", `/api/admin/checks/${id}`),
  createCheck: (input: CheckInputFields) =>
    req<{ check: RecurringCheck }>("POST", "/api/admin/checks", input),
  updateCheck: (id: string, input: CheckInputFields) =>
    req<{ check: RecurringCheck }>("PUT", `/api/admin/checks/${id}`, input),
  deleteCheck: (id: string) =>
    req<{ ok: true }>("DELETE", `/api/admin/checks/${id}`),
};
