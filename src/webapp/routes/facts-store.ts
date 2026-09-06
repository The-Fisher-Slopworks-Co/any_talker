// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { USER_FACTS_MAX_PER_USER, type Storage } from "../../storage/types";
import type { ApiResponse } from "./types";

export const FACTS_BOT_NOT_FOUND: ApiResponse = {
  status: 404,
  body: { error: "bot not found" },
};

// The vault addresses a character by URL scope: the literal "main" is the main
// bot (forBot(null)); anything else must be a registered managed bot's id.
// Telegram bot ids are numeric, so "main" can never collide with a real id.
const MAIN_BOT_SCOPE = "main";

export async function resolveFactsStorage(
  storage: Storage,
  scope: string,
): Promise<Storage | null> {
  if (scope === MAIN_BOT_SCOPE) return storage.forBot(null);
  const bot = await storage.managedBots.get(scope);
  return bot ? storage.forBot(scope) : null;
}

// Every vault mutation returns the fresh list (like the whitelist routes), so
// the client can replace its state without a second round trip. The cap rides
// along so the UI never hardcodes it.
export async function respondFacts(
  scoped: Storage,
  userId: string,
): Promise<ApiResponse> {
  const facts = await scoped.facts.list(userId);
  return { status: 200, body: { facts, cap: USER_FACTS_MAX_PER_USER } };
}
