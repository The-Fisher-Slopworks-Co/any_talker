// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { UsageStatus } from "../../../ratelimit/window";
import { req } from "./http";

// `webapp/routes/ratelimit.ts` — the owner-gated admin view of the limits,
// carrying raw token counts. The caller's own percentage-only bars come from
// `getMyUsageShare` in `./me`.
export const rateLimitApi = {
  getMyUsage: () => req<{ usage: UsageStatus }>("GET", "/api/ratelimit/me"),
  resetMyUsage: () =>
    req<{ usage: UsageStatus }>("PUT", "/api/ratelimit/me", { reset: true }),
  getUserUsage: (id: string) =>
    req<{ usage: UsageStatus }>("GET", `/api/ratelimit/user/${id}`),
  resetUserUsage: (id: string) =>
    req<{ usage: UsageStatus }>("PUT", `/api/ratelimit/user/${id}`, {
      reset: true,
    }),
};
