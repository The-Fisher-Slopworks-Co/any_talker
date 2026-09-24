// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { generateApiToken, hashApiToken } from "../auth";
import type { Route } from "./types";

// The admin API token (see `server.ts` for how it is accepted). The token
// itself leaves the server once, in the POST answer; after that only its
// creation time is readable.
export const adminApiTokenRoutes: Route[] = [
  {
    method: "GET",
    path: "/api/admin/api-token",
    handle: async ({ deps }) => {
      const record = await deps.storage.apiToken.get();
      return {
        status: 200,
        body: { createdAt: record?.createdAt ?? null },
      };
    },
  },
  // Replaces the current token, if any: creating is also rotating.
  {
    method: "POST",
    path: "/api/admin/api-token",
    handle: async ({ deps }) => {
      const token = generateApiToken();
      const createdAt = Date.now();
      await deps.storage.apiToken.save({
        hash: await hashApiToken(token),
        createdAt,
      });
      return { status: 200, body: { token, createdAt } };
    },
  },
  {
    method: "DELETE",
    path: "/api/admin/api-token",
    handle: async ({ deps }) => {
      await deps.storage.apiToken.clear();
      return { status: 200, body: { ok: true } };
    },
  },
];
