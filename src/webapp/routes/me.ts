// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { readValidDisplayName } from "../../shared/display-name";
import { getOrInitSettings } from "../../settings";
import { summarizeUsage } from "../../ratelimit/window";
import { usageShare } from "../../ratelimit/share";
import { activeBoost } from "../../ratelimit/boost";
import { userRateLimit } from "../../ratelimit/limit-class";
import { ANY_METHOD, type Route } from "./types";
import { applyUserFieldUpdates } from "./profile-fields";
import {
  FACTS_BOT_NOT_FOUND,
  handleFactItem,
  handleFactsCollection,
  resolveFactsStorage,
} from "./facts-store";

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
  // The viewer's own rate-limit standing, for the Web App header. Percentage
  // only: unlike the owner-gated `/api/ratelimit/*` routes, this one is
  // reachable by every authenticated user, so it must not carry the raw token
  // counts (`UsageStatus`) — `usageShare` collapses them to a share of budget
  // before the response body is built.
  {
    method: "GET",
    path: "/api/me/usage",
    handle: async ({ deps, actor }) => {
      const settings = await getOrInitSettings(deps.storage);
      const now = Date.now();
      const [stored, limitClass] = await Promise.all([
        deps.storage.usage.get(actor.userId),
        deps.storage.limitClasses.get(actor.userId),
      ]);
      // A share of the user's own (class-raised) budget; the class itself is
      // never in the response.
      const status = summarizeUsage(
        actor.userId,
        userRateLimit(settings, limitClass, now),
        stored,
        now,
      );
      const exempt = actor.isOwner && settings.rateLimit.ownerExempt;
      const boost = activeBoost(settings.limitBoost, now);
      return {
        status: 200,
        body: { usage: usageShare(status, exempt, boost) },
      };
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
      return handleFactsCollection(req, scoped, actor.userId);
    },
  },
  {
    method: ANY_METHOD,
    path: /^\/api\/me\/facts\/([^/]+)\/([^/]+)$/,
    handle: async ({ req, deps, actor, params }) => {
      const scoped = await resolveFactsStorage(deps.storage, params[0]!);
      if (!scoped) return FACTS_BOT_NOT_FOUND;
      return handleFactItem(req, scoped, actor.userId, params[1]!);
    },
  },
];
