// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { readValidDisplayName } from "../../shared/display-name";
import type { SpendSummary } from "../../spending/window";
import {
  LIMIT_CLASSES,
  isLimitClass,
  type LimitClass,
} from "../../shared/types";
import { ANY_METHOD, type ApiResponse, type Route } from "./types";
import { applyUserFieldUpdates } from "./profile-fields";
import {
  FACTS_BOT_NOT_FOUND,
  handleFactItem,
  handleFactsCollection,
  resolveFactsStorage,
} from "./facts-store";

const USER_NOT_FOUND: ApiResponse = {
  status: 404,
  body: { error: "user not found" },
};

const BAD_LIMIT_CLASS: ApiResponse = {
  status: 400,
  body: {
    error: `limitClass must be null or one of ${LIMIT_CLASSES.join(", ")}`,
  },
};

// ORDER-SENSITIVE. `/api/admin/users/(.+)` is greedy and would swallow the
// routes above it, so the collection, `/:id/spending`, `/:id/limit-class`,
// `/:id/facts/:scope` and `/:id/facts/:scope/:key` all have to be tried first. Keeping every `/api/admin/users` route in this
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
      const limitClasses: Record<string, LimitClass> = {};
      for (const e of await deps.storage.limitClasses.list()) {
        limitClasses[e.userId] = e.limitClass;
      }
      return {
        status: 200,
        body: { users, displayNames, spending, limitClasses },
      };
    },
  },
  // Puts the user in a limit class (`1`/`2`) or takes them out of it (`null`).
  {
    method: "PUT",
    path: /^\/api\/admin\/users\/(.+)\/limit-class$/,
    handle: async ({ req, deps, params }) => {
      const id = params[0]!;
      const { limitClass } = (req.body ?? {}) as { limitClass?: unknown };
      if (limitClass !== null && !isLimitClass(limitClass)) {
        return BAD_LIMIT_CLASS;
      }
      if (!(await deps.storage.users.get(id))) return USER_NOT_FOUND;
      if (limitClass === null) await deps.storage.limitClasses.remove(id);
      else await deps.storage.limitClasses.set(id, limitClass);
      return { status: 200, body: { limitClass } };
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
  // The admin's handle on a user's memory vault, per character scope: the
  // same records and rules as the /api/me/facts routes, addressed by an
  // explicit user id. Entered on every verb for the same reason those are (see
  // `Route.handle`). Writes need a known user so a typo'd id can't seed a
  // vault for nobody; reads stay as cheap as before.
  {
    method: ANY_METHOD,
    path: /^\/api\/admin\/users\/([^/]+)\/facts\/([^/]+)$/,
    handle: async ({ req, deps, params }) => {
      const scoped = await resolveFactsStorage(deps.storage, params[1]!);
      if (!scoped) return FACTS_BOT_NOT_FOUND;
      if (req.method !== "GET" && !(await deps.storage.users.get(params[0]!))) {
        return USER_NOT_FOUND;
      }
      return handleFactsCollection(req, scoped, params[0]!);
    },
  },
  {
    method: ANY_METHOD,
    path: /^\/api\/admin\/users\/([^/]+)\/facts\/([^/]+)\/([^/]+)$/,
    handle: async ({ req, deps, params }) => {
      const scoped = await resolveFactsStorage(deps.storage, params[1]!);
      if (!scoped) return FACTS_BOT_NOT_FOUND;
      if (!(await deps.storage.users.get(params[0]!))) return USER_NOT_FOUND;
      return handleFactItem(req, scoped, params[0]!, params[2]!);
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
        limitClass,
        allowanceMonthUsd,
      ] = await Promise.all([
        deps.storage.users.get(id),
        readValidDisplayName(deps.storage, id),
        deps.storage.profile.getTimezone(id),
        deps.storage.profile.getGender(id),
        deps.storage.profile.getLang(id),
        deps.storage.access.isWhitelisted("users", id),
        deps.storage.access.isBlacklisted("users", id),
        deps.storage.limitClasses.get(id),
        deps.storage.spend.getAllowanceMonth(id, Date.now()),
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
          limitClass,
          allowanceMonthUsd,
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
