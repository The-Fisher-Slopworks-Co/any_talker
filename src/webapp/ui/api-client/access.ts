// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { WhitelistEntry, WhitelistKind } from "../../../shared/types";
import { req } from "./http";

type AccessLists = { users: WhitelistEntry[]; chats: WhitelistEntry[] };

// `webapp/routes/access.ts` — the whitelist and the blacklist are the same
// shape under two prefixes, and every mutation answers with the fresh list.
export const accessApi = {
  getWhitelist: () => req<AccessLists>("GET", "/api/whitelist"),
  addWhitelist: (kind: WhitelistKind, entry: WhitelistEntry) =>
    req<WhitelistEntry[]>("POST", `/api/whitelist/${kind}`, entry),
  removeWhitelist: (kind: WhitelistKind, id: string) =>
    req<WhitelistEntry[]>("DELETE", `/api/whitelist/${kind}/${id}`),
  getBlacklist: () => req<AccessLists>("GET", "/api/blacklist"),
  addBlacklist: (kind: WhitelistKind, entry: WhitelistEntry) =>
    req<WhitelistEntry[]>("POST", `/api/blacklist/${kind}`, entry),
  removeBlacklist: (kind: WhitelistKind, id: string) =>
    req<WhitelistEntry[]>("DELETE", `/api/blacklist/${kind}/${id}`),
};
