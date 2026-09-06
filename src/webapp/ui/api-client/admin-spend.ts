// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { SpendOverview } from "../../../spending/overview";
import { req } from "./http";

// `webapp/routes/admin-spend.ts`
export const adminSpendApi = {
  getSpendOverview: () =>
    req<SpendOverview>("GET", "/api/admin/spend/overview"),
};
