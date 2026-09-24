// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { req } from "./http";

// `webapp/routes/admin-api-token.ts`
export const adminApiTokenApi = {
  // When the current token was created; null when there is none.
  getApiToken: () =>
    req<{ createdAt: number | null }>("GET", "/api/admin/api-token"),
  // The only answer that carries the token itself.
  createApiToken: () =>
    req<{ token: string; createdAt: number }>("POST", "/api/admin/api-token"),
  deleteApiToken: () => req<{ ok: true }>("DELETE", "/api/admin/api-token"),
};
