// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { Gender } from "../../../shared/types";
import type { Lang } from "../../../shared/i18n";
import type { DateFormat } from "../../../shared/date-format";
import type { UsageShare } from "../../../ratelimit/share";
import { req } from "./http";

export type MeResponse = {
  isOwner: boolean;
  displayName: string | null;
  timezone: string | null;
  gender: Gender | null;
  language: Lang | null;
  dateFormat: DateFormat | null;
};
export type UserFact = { key: string; value: string };
export type FactBot = {
  botId: string | null;
  displayName: string | null;
  username: string | null;
};
export type FactsResponse = { facts: UserFact[]; cap: number };

// `webapp/routes/me.ts` — the caller's own profile, bots and fact vaults. Every
// vault mutation answers with the fresh list plus the cap, so the UI replaces
// its state without a second round trip.
export const meApi = {
  getMe: () => req<MeResponse>("GET", "/api/me"),
  putMe: (patch: {
    displayName?: string | null;
    timezone?: string | null;
    gender?: Gender | null;
    language?: Lang | null;
    dateFormat?: DateFormat | null;
  }) => req<MeResponse>("PUT", "/api/me", patch),
  // Percentage-only view of the caller's own limits (the header bars). Distinct
  // from `getMyUsage` in `./ratelimit`, which is the owner-gated admin route
  // carrying raw token counts.
  getMyUsageShare: () => req<{ usage: UsageShare }>("GET", "/api/me/usage"),
  listMyBots: () => req<{ bots: FactBot[] }>("GET", "/api/me/bots"),
  listMyFacts: (scope: string) =>
    req<FactsResponse>("GET", `/api/me/facts/${scope}`),
  addMyFact: (scope: string, fact: UserFact) =>
    req<FactsResponse>("POST", `/api/me/facts/${scope}`, fact),
  updateMyFact: (
    scope: string,
    key: string,
    patch: { value: string; newKey?: string },
  ) => req<FactsResponse>("PUT", `/api/me/facts/${scope}/${key}`, patch),
  deleteMyFact: (scope: string, key: string) =>
    req<FactsResponse>("DELETE", `/api/me/facts/${scope}/${key}`),
};
