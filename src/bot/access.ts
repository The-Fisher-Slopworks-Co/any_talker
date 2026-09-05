// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { Storage } from "../storage/types";

// Why the gate said no. Carried on the `denied` outcome so the dispatcher can
// log it — a blacklisted user/chat and a merely-not-whitelisted one look
// identical to the chat (silent deny) and must not look identical in the logs.
export type AccessDenyReason = "blacklisted" | "not_whitelisted";

export type AccessVerdict =
  { allowed: true } | { allowed: false; reason: AccessDenyReason };

export async function checkAccess(args: {
  storage: Storage;
  ownerId: string;
  userId: string;
  chatId: string;
  // Set only when the message was sent on behalf of a chat — an anonymous group
  // admin, or a channel commenting under its own post (see `bot/identity.ts`).
  // Then `userId` is that chat's id, so the *chat* lists are the ones the admin
  // UI actually files it under and the ones consulted here. Note the owner
  // cannot be recognized through it: Telegram exposes no link between a channel
  // and the human behind it, and nothing configures one, so the owner posting
  // as their channel is a stranger to this gate — whitelisting the channel is
  // how they let it back in.
  senderChatId?: string | null | undefined;
  // When false the whitelist is not consulted and everyone is allowed (the
  // budget guard + rate limit remain the only protection). See
  // `Settings.whitelistEnabled`.
  whitelistEnabled: boolean;
}): Promise<AccessVerdict> {
  const { storage, ownerId, userId, chatId, whitelistEnabled } = args;
  const senderChatId = args.senderChatId ?? null;
  if (userId === ownerId) return { allowed: true };
  // The blacklist always applies (only the owner is immune, checked above —
  // same short-circuit the whitelist gets): a blocked user, anyone speaking in
  // a blocked chat, and any chat speaking as itself is denied even while the
  // whitelist is off, and a whitelist entry never overrides it.
  if (
    (await storage.isBlacklisted("users", userId)) ||
    (await storage.isBlacklisted("chats", chatId)) ||
    (senderChatId !== null &&
      (await storage.isBlacklisted("chats", senderChatId)))
  ) {
    return { allowed: false, reason: "blacklisted" };
  }
  if (!whitelistEnabled) return { allowed: true };
  if (await storage.isWhitelisted("users", userId)) return { allowed: true };
  if (await storage.isWhitelisted("chats", chatId)) return { allowed: true };
  if (
    senderChatId !== null &&
    (await storage.isWhitelisted("chats", senderChatId))
  ) {
    return { allowed: true };
  }
  return { allowed: false, reason: "not_whitelisted" };
}
