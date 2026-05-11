// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { Storage } from "../storage/types";

export async function isAllowed(args: {
  storage: Storage;
  ownerId: string;
  userId: string;
  chatId: string;
}): Promise<boolean> {
  const { storage, ownerId, userId, chatId } = args;
  if (userId === ownerId) return true;
  if (await storage.isWhitelisted("users", userId)) return true;
  if (await storage.isWhitelisted("chats", chatId)) return true;
  return false;
}
