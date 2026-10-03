// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { USER_FACTS_MAX_PER_USER, type Storage } from "../../storage/types";
import { normalizeFactKey, normalizeFactValue } from "../../shared/user-facts";
import type { ApiRequest, ApiResponse } from "./types";

export const FACTS_BOT_NOT_FOUND: ApiResponse = {
  status: 404,
  body: { error: "bot not found" },
};
const BAD_FACT_KEY: ApiResponse = {
  status: 400,
  body: { error: "invalid fact key" },
};
const BAD_FACT_VALUE: ApiResponse = {
  status: 400,
  body: { error: "invalid fact value" },
};
const FACTS_LIMIT_REACHED: ApiResponse = {
  status: 400,
  body: { error: "limit reached" },
};
const FACT_NOT_FOUND: ApiResponse = {
  status: 404,
  body: { error: "fact not found" },
};
const FACT_KEY_EXISTS: ApiResponse = {
  status: 409,
  body: { error: "fact key exists" },
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
async function respondFacts(
  scoped: Storage,
  userId: string,
): Promise<ApiResponse> {
  const facts = await scoped.facts.list(userId);
  return { status: 200, body: { facts, cap: USER_FACTS_MAX_PER_USER } };
}

// The verbs of a vault (`.../facts/:scope`), shared by the user's own routes
// and the admin's per-user ones so both edit by the same rules. `null` for a
// verb the vault doesn't serve.
export async function handleFactsCollection(
  req: ApiRequest,
  scoped: Storage,
  userId: string,
): Promise<ApiResponse | null> {
  if (req.method === "GET") return respondFacts(scoped, userId);

  if (req.method === "POST") {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const key = normalizeFactKey(body.key);
    if (key === null) return BAD_FACT_KEY;
    const value = normalizeFactValue(body.value);
    if (value === null) return BAD_FACT_VALUE;
    // Check-then-save soft cap, mirroring the reminders cap rationale: an
    // explicit UI add must be rejected at the limit, never silently evict a
    // memory the way the AI's remember_fact does. Upserting an existing key
    // doesn't grow the count, so it is always allowed.
    const existing = await scoped.facts.list(userId);
    const isUpdate = existing.some((f) => f.key === key);
    if (!isUpdate && existing.length >= USER_FACTS_MAX_PER_USER) {
      return FACTS_LIMIT_REACHED;
    }
    await scoped.facts.remember(userId, key, value);
    return respondFacts(scoped, userId);
  }

  return null;
}

// The verbs of one fact (`.../facts/:scope/:key`); see handleFactsCollection.
export async function handleFactItem(
  req: ApiRequest,
  scoped: Storage,
  userId: string,
  rawKey: string,
): Promise<ApiResponse | null> {
  // The key charset ([a-z0-9_]) is URL-safe, so the path segment is the key
  // verbatim; anything else fails normalization here.
  const key = normalizeFactKey(rawKey);
  if (key === null) return BAD_FACT_KEY;

  if (req.method === "PUT") {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const value = normalizeFactValue(body.value);
    if (value === null) return BAD_FACT_VALUE;
    const facts = await scoped.facts.list(userId);
    if (!facts.some((f) => f.key === key)) return FACT_NOT_FOUND;
    let nextKey = key;
    if (body.newKey !== undefined) {
      const renamed = normalizeFactKey(body.newKey);
      if (renamed === null) return BAD_FACT_KEY;
      nextKey = renamed;
    }
    if (nextKey !== key) {
      // Renaming onto another fact's key would silently destroy it — reject.
      if (facts.some((f) => f.key === nextKey)) return FACT_KEY_EXISTS;
      // Delete-then-create: freeing the old slot first means a rename can
      // never trip the cap, even at exactly 50/50.
      await scoped.facts.forget(userId, key);
    }
    await scoped.facts.remember(userId, nextKey, value);
    return respondFacts(scoped, userId);
  }

  if (req.method === "DELETE") {
    // Idempotent: deleting an already-gone fact succeeds, mirroring
    // forget_fact's {existed:false}-is-not-an-error semantics.
    await scoped.facts.forget(userId, key);
    return respondFacts(scoped, userId);
  }

  return null;
}
