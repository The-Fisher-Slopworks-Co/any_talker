// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { USER_FACTS_MAX_PER_USER } from "../../storage/types";
import { normalizeFactKey, normalizeFactValue } from "../../shared/user-facts";
import { readValidDisplayName } from "../../shared/display-name";
import { ANY_METHOD, type ApiResponse, type Route } from "./types";
import { applyUserFieldUpdates } from "./profile-fields";
import {
  FACTS_BOT_NOT_FOUND,
  resolveFactsStorage,
  respondFacts,
} from "./facts-store";

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

// Everything an authenticated user may reach about themselves. Scoped strictly
// to `actor.userId` — no route here takes a user id from the request.
//
// No pattern here can shadow another: the literal paths are distinct and both
// facts patterns are anchored to an exact segment count.
export const meRoutes: Route[] = [
  {
    method: "GET",
    path: "/api/me",
    handle: async ({ deps, actor }) => {
      const [displayName, timezone, gender, language, dateFormat] =
        await Promise.all([
          readValidDisplayName(deps.storage, actor.userId),
          deps.storage.profile.getTimezone(actor.userId),
          deps.storage.profile.getGender(actor.userId),
          deps.storage.profile.getLang(actor.userId),
          deps.storage.profile.getDateFormat(actor.userId),
        ]);
      return {
        status: 200,
        body: {
          isOwner: actor.isOwner,
          displayName,
          timezone,
          gender,
          language,
          dateFormat,
        },
      };
    },
  },
  {
    method: "PUT",
    path: "/api/me",
    handle: async ({ req, deps, actor }) => {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const [currentName, currentTz, currentGender, currentLang, currentDf] =
        await Promise.all([
          readValidDisplayName(deps.storage, actor.userId),
          deps.storage.profile.getTimezone(actor.userId),
          deps.storage.profile.getGender(actor.userId),
          deps.storage.profile.getLang(actor.userId),
          deps.storage.profile.getDateFormat(actor.userId),
        ]);
      const updated = await applyUserFieldUpdates(
        deps.storage,
        actor.userId,
        body,
        {
          displayName: currentName,
          timezone: currentTz,
          gender: currentGender,
          language: currentLang,
          dateFormat: currentDf,
        },
        { includeDateFormat: true },
      );
      if (!updated.ok) return updated.error;
      return {
        status: 200,
        body: { isOwner: actor.isOwner, ...updated.fields },
      };
    },
  },
  {
    method: "GET",
    path: "/api/me/spending",
    handle: async ({ deps, actor }) => {
      const spending = await deps.storage.spend.getUser(
        actor.userId,
        Date.now(),
      );
      return { status: 200, body: { spending } };
    },
  },
  // Memory vault: the family roster for the character switcher. A narrow DTO
  // on purpose — never the raw ManagedBot, which carries systemPrompt and
  // ownerUserId that a non-owner must not see. Bot names/usernames are already
  // public via Telegram, so exposing the roster to any authenticated user is fine.
  {
    method: "GET",
    path: "/api/me/bots",
    handle: async ({ deps }) => {
      const managed = await deps.storage.managedBots.list();
      const bots: Array<{
        botId: string | null;
        displayName: string | null;
        username: string | null;
      }> = [
        { botId: null, displayName: null, username: null },
        ...managed.map((b) => ({
          botId: b.botId,
          displayName: b.displayName,
          username: b.username,
        })),
      ];
      return { status: 200, body: { bots } };
    },
  },
  // Memory vault: a user reads/edits the facts a character remembers about
  // them. These two are the only routes entered on every verb rather than one:
  // an unknown character scope (and, on the item route, a malformed key) is a
  // property of the URL, answered the same way whatever the method is, and the
  // verb only picks what to do once the URL has passed. Falling through with
  // `null` is what a verb they don't serve gets.
  {
    method: ANY_METHOD,
    path: /^\/api\/me\/facts\/([^/]+)$/,
    handle: async ({ req, deps, actor, params }) => {
      const scoped = await resolveFactsStorage(deps.storage, params[0]!);
      if (!scoped) return FACTS_BOT_NOT_FOUND;

      if (req.method === "GET") return respondFacts(scoped, actor.userId);

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
        const existing = await scoped.facts.list(actor.userId);
        const isUpdate = existing.some((f) => f.key === key);
        if (!isUpdate && existing.length >= USER_FACTS_MAX_PER_USER) {
          return FACTS_LIMIT_REACHED;
        }
        await scoped.facts.remember(actor.userId, key, value);
        return respondFacts(scoped, actor.userId);
      }

      return null;
    },
  },
  {
    method: ANY_METHOD,
    path: /^\/api\/me\/facts\/([^/]+)\/([^/]+)$/,
    handle: async ({ req, deps, actor, params }) => {
      const scoped = await resolveFactsStorage(deps.storage, params[0]!);
      if (!scoped) return FACTS_BOT_NOT_FOUND;
      // The key charset ([a-z0-9_]) is URL-safe, so the path segment is the key
      // verbatim; anything else fails normalization here.
      const key = normalizeFactKey(params[1]!);
      if (key === null) return BAD_FACT_KEY;

      if (req.method === "PUT") {
        const body = (req.body ?? {}) as Record<string, unknown>;
        const value = normalizeFactValue(body.value);
        if (value === null) return BAD_FACT_VALUE;
        const facts = await scoped.facts.list(actor.userId);
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
          await scoped.facts.forget(actor.userId, key);
        }
        await scoped.facts.remember(actor.userId, nextKey, value);
        return respondFacts(scoped, actor.userId);
      }

      if (req.method === "DELETE") {
        // Idempotent: deleting an already-gone fact succeeds, mirroring
        // forget_fact's {existed:false}-is-not-an-error semantics.
        await scoped.facts.forget(actor.userId, key);
        return respondFacts(scoped, actor.userId);
      }

      return null;
    },
  },
];
