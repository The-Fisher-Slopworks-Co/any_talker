// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { Storage } from "../storage/types";

// Why the gate said no. Carried on the `denied` outcome so the dispatcher can
// log it — a blacklisted user and a merely-not-whitelisted one look identical
// to the chat (silent deny) and must not look identical in the logs.
export type AccessDenyReason = "blacklisted" | "not_whitelisted";

export type AccessVerdict =
  | { allowed: true }
  | { allowed: false; reason: AccessDenyReason };

export async function checkAccess(args: {
  storage: Storage;
  ownerId: string;
  userId: string;
  chatId: string;
  // When false the whitelist is not consulted and everyone is allowed (the
  // budget guard + rate limit remain the only protection). See
  // `Settings.whitelistEnabled`.
  whitelistEnabled: boolean;
}): Promise<AccessVerdict> {
  const { storage, ownerId, userId, chatId, whitelistEnabled } = args;
  if (userId === ownerId) return { allowed: true };
  // The blacklist always applies (only the owner is immune): a blocked user is
  // denied even while the whitelist is off, and a whitelist entry (their own or
  // the chat's) never overrides it.
  if (await storage.isBlacklisted(userId)) {
    return { allowed: false, reason: "blacklisted" };
  }
  if (!whitelistEnabled) return { allowed: true };
  if (await storage.isWhitelisted("users", userId)) return { allowed: true };
  if (await storage.isWhitelisted("chats", chatId)) return { allowed: true };
  return { allowed: false, reason: "not_whitelisted" };
}
