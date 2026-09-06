// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { gatherSpendOverview } from "../../spending/overview";
import type { Route } from "./types";

const NEW_ENTITY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export const adminSpendRoutes: Route[] = [
  // Consolidated spend dashboard: global aggregate, top spenders (users +
  // chats), per-model breakdown, denial leaderboard, and entities first seen in
  // the last 7 days.
  {
    method: "GET",
    path: "/api/admin/spend/overview",
    handle: async ({ deps }) => {
      const now = Date.now();
      const overview = await gatherSpendOverview(deps.storage, now, {
        limit: 10,
        newSinceMs: now - NEW_ENTITY_WINDOW_MS,
      });
      return { status: 200, body: overview };
    },
  },
];
