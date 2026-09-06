// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { WhitelistEntry, WhitelistKind } from "../../shared/types";

// Whitelist and blacklist (global, not affected by `forBot`).
export interface AccessStore {
  listWhitelist(kind: WhitelistKind): Promise<WhitelistEntry[]>;
  addWhitelist(kind: WhitelistKind, entry: WhitelistEntry): Promise<void>;
  removeWhitelist(kind: WhitelistKind, id: string): Promise<void>;
  isWhitelisted(kind: WhitelistKind, id: string): Promise<boolean>;

  // Blacklist (global, not affected by `forBot`), over the same two kinds as the
  // whitelist. A blacklisted user — or anyone speaking in a blacklisted chat —
  // is denied regardless of `whitelistEnabled` or any whitelist entry; the owner
  // is immune (the access gates check ownership first). Reuses the
  // `WhitelistEntry` shape (id+label).
  listBlacklist(kind: WhitelistKind): Promise<WhitelistEntry[]>;
  addBlacklist(kind: WhitelistKind, entry: WhitelistEntry): Promise<void>;
  removeBlacklist(kind: WhitelistKind, id: string): Promise<void>;
  isBlacklisted(kind: WhitelistKind, id: string): Promise<boolean>;
}
