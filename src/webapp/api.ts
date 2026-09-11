// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type {
  ApiActor,
  ApiDeps,
  ApiRequest,
  ApiResponse,
  Route,
} from "./routes/types";
import { FORBIDDEN, NOT_FOUND } from "./routes/responses";
import { meRoutes } from "./routes/me";
import { meReminderRoutes, adminReminderRoutes } from "./routes/reminders";
import { modelRoutes } from "./routes/models";
import { settingsRoutes } from "./routes/settings";
import { accessRoutes } from "./routes/access";
import { adminUserRoutes } from "./routes/admin-users";
import { adminSpendRoutes } from "./routes/admin-spend";
import { rateLimitRoutes } from "./routes/ratelimit";
import { adminChatRoutes } from "./routes/admin-chats";
import { adminCheckRoutes } from "./routes/admin-checks";
import { adminFeedbackRoutes } from "./routes/admin-feedback";
import { adminManagedBotRoutes } from "./routes/admin-managed-bots";

export type {
  ApiRequest,
  ApiResponse,
  ApiActor,
  ApiDeps,
  ManagedBotController,
} from "./routes/types";

// Reachable by any authenticated user; every one of these is scoped to
// `actor.userId` and never takes an id from the request.
const PUBLIC_ROUTES: Route[] = [...meReminderRoutes, ...meRoutes];

// Reachable only by the owner (see the gate in `handleApi`).
//
// Route precedence: matching is first-hit over this list, so a greedy pattern
// above a narrower one would shadow it — `/api/admin/managed-bots/:id` reading
// "new" as a bot id is the classic one. Every group whose patterns can overlap
// is kept whole inside a single module's array (`admin-users`, `admin-chats`,
// `admin-checks`, `admin-feedback`, `admin-managed-bots`, `access`), ordered
// and commented there, so the guarantee is local to one file instead of spread
// over this list.
// Between the groups below the URL prefixes are disjoint, which makes the order
// of these spreads presentational.
const ADMIN_ROUTES: Route[] = [
  ...modelRoutes,
  ...settingsRoutes,
  ...accessRoutes,
  ...adminUserRoutes,
  ...adminReminderRoutes,
  ...adminSpendRoutes,
  ...rateLimitRoutes,
  ...adminChatRoutes,
  ...adminCheckRoutes,
  ...adminFeedbackRoutes,
  ...adminManagedBotRoutes,
];

// The capture groups of a matching route, or null when this route is not the
// one. A path that matches with the wrong method is *not* a match: the request
// falls through to the routes below, exactly as the original if-chain did.
function matchRoute(route: Route, req: ApiRequest): string[] | null {
  const takesMethod =
    typeof route.method === "string"
      ? route.method === req.method
      : route.method.includes(req.method);
  if (!takesMethod) return null;
  if (typeof route.path === "string") {
    return route.path === req.path ? [] : null;
  }
  const m = req.path.match(route.path);
  return m ? m.slice(1) : null;
}

async function dispatch(
  routes: Route[],
  req: ApiRequest,
  deps: ApiDeps,
  actor: ApiActor,
): Promise<ApiResponse | null> {
  for (const route of routes) {
    const params = matchRoute(route, req);
    if (!params) continue;
    const res = await route.handle({ req, deps, actor, params });
    // A null answer is a route declining after its path-level checks passed;
    // matching continues below it.
    if (res) return res;
  }
  return null;
}

export async function handleApi(
  req: ApiRequest,
  deps: ApiDeps,
  actor: ApiActor,
): Promise<ApiResponse> {
  const own = await dispatch(PUBLIC_ROUTES, req, deps, actor);
  if (own) return own;

  // Everything below this line is admin-only. Note it answers 403, not 404, for
  // an unknown path too: a non-owner learns nothing about the admin surface.
  if (!actor.isOwner) return FORBIDDEN;

  return (await dispatch(ADMIN_ROUTES, req, deps, actor)) ?? NOT_FOUND;
}
