// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { Storage } from "../storage/types";

export async function isAllowed(args: {
  storage: Storage;
  ownerId: string;
  userId: string;
  chatId: string;
  // When false the whitelist is not consulted and everyone is allowed (the
  // budget guard + rate limit remain the only protection). See
  // `Settings.whitelistEnabled`.
  whitelistEnabled: boolean;
}): Promise<boolean> {
  const { storage, ownerId, userId, chatId, whitelistEnabled } = args;
  if (userId === ownerId) return true;
  // The blacklist always applies (only the owner is immune): a blocked user is
  // denied even while the whitelist is off, and a whitelist entry (their own or
  // the chat's) never overrides it.
  if (await storage.isBlacklisted(userId)) return false;
  if (!whitelistEnabled) return true;
  if (await storage.isWhitelisted("users", userId)) return true;
  if (await storage.isWhitelisted("chats", chatId)) return true;
  return false;
}
