// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { readValidDisplayName } from "../../shared/display-name";
import type { SpendSummary } from "../../spending/window";
import type { ApiResponse, Route } from "./types";
import { applyUserFieldUpdates } from "./profile-fields";
import {
  FACTS_BOT_NOT_FOUND,
  resolveFactsStorage,
  respondFacts,
} from "./facts-store";

const USER_NOT_FOUND: ApiResponse = {
  status: 404,
  body: { error: "user not found" },
};

// ORDER-SENSITIVE. `/api/admin/users/(.+)` is greedy and would swallow the two
// routes above it, so the collection, `/:id/spending` and `/:id/facts/:scope`
// all have to be tried first. Keeping every `/api/admin/users` route in this
// one array is what makes that guarantee local and reviewable.
export const adminUserRoutes: Route[] = [
  {
    method: "GET",
    path: "/api/admin/users",
    handle: async ({ deps }) => {
      const now = Date.now();
      const users = await deps.storage.users.list();
      const rows = await Promise.all(
        users.map(
          async (u) =>
            [
              u.id,
              await readValidDisplayName(deps.storage, u.id),
              await deps.storage.spend.getUser(u.id, now),
            ] as const,
        ),
      );
      const displayNames: Record<string, string | null> = {};
      const spending: Record<string, SpendSummary> = {};
      for (const [id, name, spend] of rows) {
        displayNames[id] = name;
        spending[id] = spend;
      }
      return { status: 200, body: { users, displayNames, spending } };
    },
  },
  {
    method: "GET",
    path: /^\/api\/admin\/users\/(.+)\/spending$/,
    handle: async ({ deps, params }) => {
      const spending = await deps.storage.spend.getUser(params[0]!, Date.now());
      return { status: 200, body: { spending } };
    },
  },
  // Read-only admin view into a user's memory vault, per character scope —
  // the same records the /api/me/facts routes serve, addressed by an explicit
  // user id. Deliberately GET-only: edits stay with the user (and the AI tools),
  // the admin only inspects.
  {
    method: "GET",
    path: /^\/api\/admin\/users\/([^/]+)\/facts\/([^/]+)$/,
    handle: async ({ deps, params }) => {
      const scoped = await resolveFactsStorage(deps.storage, params[1]!);
      if (!scoped) return FACTS_BOT_NOT_FOUND;
      return respondFacts(scoped, params[0]!);
    },
  },
  {
    method: "GET",
    path: /^\/api\/admin\/users\/(.+)$/,
    handle: async ({ deps, params }) => {
      const id = params[0]!;
      const [
        user,
        displayName,
        timezone,
        gender,
        language,
        whitelisted,
        blacklisted,
      ] = await Promise.all([
        deps.storage.users.get(id),
        readValidDisplayName(deps.storage, id),
        deps.storage.profile.getTimezone(id),
        deps.storage.profile.getGender(id),
        deps.storage.profile.getLang(id),
        deps.storage.access.isWhitelisted("users", id),
        deps.storage.access.isBlacklisted("users", id),
      ]);
      if (!user) return USER_NOT_FOUND;
      return {
        status: 200,
        body: {
          user,
          displayName,
          timezone,
          gender,
          language,
          whitelisted,
          blacklisted,
        },
      };
    },
  },
  {
    method: "PUT",
    path: /^\/api\/admin\/users\/(.+)$/,
    handle: async ({ req, deps, params }) => {
      const id = params[0]!;
      const user = await deps.storage.users.get(id);
      if (!user) return USER_NOT_FOUND;
      const body = (req.body ?? {}) as Record<string, unknown>;
      const [currentName, currentTz, currentGender, currentLang] =
        await Promise.all([
          readValidDisplayName(deps.storage, id),
          deps.storage.profile.getTimezone(id),
          deps.storage.profile.getGender(id),
          deps.storage.profile.getLang(id),
        ]);
      // No dateFormat here: it stays the user's own setting, unreachable from
      // the admin route even if the body carries one.
      const updated = await applyUserFieldUpdates(
        deps.storage,
        id,
        body,
        {
          displayName: currentName,
          timezone: currentTz,
          gender: currentGender,
          language: currentLang,
        },
        { includeDateFormat: false },
      );
      if (!updated.ok) return updated.error;
      return { status: 200, body: { user, ...updated.fields } };
    },
  },
];
