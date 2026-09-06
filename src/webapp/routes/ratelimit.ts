// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { Storage } from "../../storage/types";
import type { RateLimitConfig } from "../../shared/types";
import { getOrInitSettings } from "../../settings";
import { summarizeUsage, type UsageStatus } from "../../ratelimit/window";
import type { ApiResponse, Route } from "./types";

// The dual-window usage is per user and global, so a single record describes a
// user everywhere. Resolved against the current config + windows for display.
async function userUsageStatus(
  storage: Storage,
  userId: string,
  config: RateLimitConfig,
  now: number,
): Promise<UsageStatus> {
  const stored = await storage.usage.get(userId);
  return summarizeUsage(userId, config, stored, now);
}

async function respondUsage(
  storage: Storage,
  userId: string,
): Promise<ApiResponse> {
  const settings = await getOrInitSettings(storage);
  const usage = await userUsageStatus(
    storage,
    userId,
    settings.rateLimit,
    Date.now(),
  );
  return { status: 200, body: { usage } };
}

function wantsReset(body: unknown): boolean {
  return Boolean(((body ?? {}) as { reset?: boolean }).reset);
}

export const rateLimitRoutes: Route[] = [
  {
    method: "GET",
    path: "/api/ratelimit/me",
    handle: ({ deps }) => respondUsage(deps.storage, deps.ownerId),
  },
  {
    method: "PUT",
    path: "/api/ratelimit/me",
    handle: async ({ req, deps }) => {
      // The settings read happens before the reset here, and after it on the
      // by-id route below; both orderings are preserved as they were.
      const settings = await getOrInitSettings(deps.storage);
      if (wantsReset(req.body)) await deps.rateLimiter.reset(deps.ownerId);
      const usage = await userUsageStatus(
        deps.storage,
        deps.ownerId,
        settings.rateLimit,
        Date.now(),
      );
      return { status: 200, body: { usage } };
    },
  },
  {
    method: "GET",
    path: /^\/api\/ratelimit\/user\/(.+)$/,
    handle: ({ deps, params }) => respondUsage(deps.storage, params[0]!),
  },
  {
    method: "PUT",
    path: /^\/api\/ratelimit\/user\/(.+)$/,
    handle: async ({ req, deps, params }) => {
      const id = params[0]!;
      if (wantsReset(req.body)) await deps.rateLimiter.reset(id);
      return respondUsage(deps.storage, id);
    },
  },
];
