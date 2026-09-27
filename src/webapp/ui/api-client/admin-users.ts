// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { Gender, LimitClass, User } from "../../../shared/types";
import type { Lang } from "../../../shared/i18n";
import type { SpendSummary } from "../../../spending/window";
import type { FactsResponse } from "./me";
import { req } from "./http";

export type SpendingResponse = {
  spending: SpendSummary;
};

export type UserSettingsResponse = {
  user: User;
  displayName: string | null;
  timezone: string | null;
  gender: Gender | null;
  language: Lang | null;
  whitelisted: boolean;
  blacklisted: boolean;
  limitClass: LimitClass | null;
  // Drawn from the limit-class allowance this UTC calendar month.
  allowanceMonthUsd: number;
};

// `webapp/routes/admin-users.ts`
export const adminUsersApi = {
  listAdminUsers: () =>
    req<{
      users: User[];
      displayNames: Record<string, string | null>;
      spending: Record<string, SpendSummary>;
      limitClasses: Record<string, LimitClass>;
    }>("GET", "/api/admin/users"),
  putUserLimitClass: (id: string, limitClass: LimitClass | null) =>
    req<{ limitClass: LimitClass | null }>(
      "PUT",
      `/api/admin/users/${id}/limit-class`,
      { limitClass },
    ),
  getAdminUser: (id: string) =>
    req<UserSettingsResponse>("GET", `/api/admin/users/${id}`),
  putAdminUser: (
    id: string,
    patch: {
      displayName?: string | null;
      timezone?: string | null;
      gender?: Gender | null;
      language?: Lang | null;
    },
  ) =>
    req<{
      user: User;
      displayName: string | null;
      timezone: string | null;
      gender: Gender | null;
      language: Lang | null;
    }>("PUT", `/api/admin/users/${id}`, patch),
  getUserSpending: (id: string) =>
    req<SpendingResponse>("GET", `/api/admin/users/${id}/spending`),
  listUserFacts: (id: string, scope: string) =>
    req<FactsResponse>("GET", `/api/admin/users/${id}/facts/${scope}`),
};
