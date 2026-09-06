// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

export type WhitelistKind = "users" | "chats";

export type WhitelistEntry = {
  id: string;
  label?: string;
};
