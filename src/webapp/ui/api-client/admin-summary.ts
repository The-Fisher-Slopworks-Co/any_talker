// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { AdminSummary } from "../../../shared/types/admin-summary";
import { req } from "./http";

// `webapp/routes/admin-summary.ts`
export const adminSummaryApi = {
  // The counts shown beside the admin home's rows.
  getAdminSummary: () => req<AdminSummary>("GET", "/api/admin/summary"),
};
