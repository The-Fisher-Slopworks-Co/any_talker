// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type {
  Settings,
  RateLimitConfig,
  BudgetConfig,
  AnomalyConfig,
} from "../../shared/types";
import {
  isValidTimezone,
  isValidProviderSlug,
  isValidProviderSort,
  isValidServiceTier,
} from "../../shared/types";
import { getOrInitSettings } from "../../settings";
import type { ApiResponse, Route } from "./types";
import { BAD_TIMEZONE } from "./responses";
import { unknownModelsError } from "./models";

const BAD_MODELS: ApiResponse = {
  status: 400,
  body: { error: "models must be a non-empty array of non-empty strings" },
};

const BAD_PROVIDER_SORT: ApiResponse = {
  status: 400,
  body: { error: "invalid providerSort" },
};

const BAD_PROVIDER: ApiResponse = {
  status: 400,
  body: { error: "invalid provider" },
};

const BAD_SERVICE_TIER: ApiResponse = {
  status: 400,
  body: { error: "invalid serviceTier" },
};

const BAD_RATE_LIMIT_MULTIPLIER: ApiResponse = {
  status: 400,
  body: { error: "the /askwise multiplier must be a number >= 1" },
};

const BAD_RATE_LIMIT_TOKENS: ApiResponse = {
  status: 400,
  body: { error: "rate-limit token budgets must be non-negative numbers" },
};

const BAD_EXPANDABLE_THRESHOLD: ApiResponse = {
  status: 400,
  body: {
    error: "expandableBlockquoteThreshold must be a non-negative integer",
  },
};

const BAD_MAX_REMINDERS: ApiResponse = {
  status: 400,
  body: { error: "maxRemindersPerUser must be an integer >= 1" },
};

const BAD_WHITELIST_ENABLED: ApiResponse = {
  status: 400,
  body: { error: "whitelistEnabled must be a boolean" },
};

const BAD_BUDGET: ApiResponse = {
  status: 400,
  body: {
    error:
      "budget caps must be non-negative numbers; newUserWindowDays an integer >= 1",
  },
};

const BAD_ANOMALY: ApiResponse = {
  status: 400,
  body: {
    error:
      "anomaly thresholds must be non-negative numbers; velocity multiplier >= 1; digestIntervalHours an integer >= 1",
  },
};

// True when a nullable settings field is absent (not being patched), explicitly
// cleared, or a well-formed value.
function nullOrValid<T>(v: unknown, isValid: (x: unknown) => x is T): boolean {
  return v === undefined || v === null || isValid(v);
}

const nonNegNum = (v: unknown): boolean =>
  v === undefined || (typeof v === "number" && Number.isFinite(v) && v >= 0);
const posIntOrUndef = (v: unknown): boolean =>
  v === undefined || (typeof v === "number" && Number.isInteger(v) && v >= 1);
const boolOrUndef = (v: unknown): boolean =>
  v === undefined || typeof v === "boolean";

function validateBudgetPatch(b: Partial<BudgetConfig>): boolean {
  return (
    nonNegNum(b.globalMonthlyCapUsd) &&
    nonNegNum(b.globalDailyCapUsd) &&
    nonNegNum(b.perChatDailyCapUsd) &&
    nonNegNum(b.newUserDailyCapUsd) &&
    posIntOrUndef(b.newUserWindowDays) &&
    boolOrUndef(b.enabled) &&
    boolOrUndef(b.ownerExempt)
  );
}

function validateAnomalyPatch(a: Partial<AnomalyConfig>): boolean {
  const mult = a.spikeVelocityMultiplier;
  return (
    nonNegNum(a.spikeUserAbsoluteUsd) &&
    nonNegNum(a.spikeChatAbsoluteUsd) &&
    nonNegNum(a.spikeMinBaselineUsd) &&
    posIntOrUndef(a.digestIntervalHours) &&
    (mult === undefined || (typeof mult === "number" && mult >= 1))
  );
}

function isValidModelsList(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((m) => typeof m === "string" && m.trim().length > 0)
  );
}

export const settingsRoutes: Route[] = [
  {
    method: "GET",
    path: "/api/settings",
    handle: async ({ deps }) => {
      const s = await getOrInitSettings(deps.storage);
      return { status: 200, body: s };
    },
  },
  {
    method: "PUT",
    path: "/api/settings",
    handle: async ({ req, deps }) => {
      const current = await getOrInitSettings(deps.storage);
      const patch = (req.body ?? {}) as Partial<Settings>;
      if (patch.timezone !== undefined && !isValidTimezone(patch.timezone)) {
        return BAD_TIMEZONE;
      }
      if (patch.models !== undefined && !isValidModelsList(patch.models)) {
        return BAD_MODELS;
      }
      // `null` clears the field back to "let the gateway decide"; anything else
      // has to be well-formed, since it ends up in a live request body.
      if (!nullOrValid(patch.providerSort, isValidProviderSort)) {
        return BAD_PROVIDER_SORT;
      }
      if (!nullOrValid(patch.provider, isValidProviderSlug)) {
        return BAD_PROVIDER;
      }
      if (!nullOrValid(patch.serviceTier, isValidServiceTier)) {
        return BAD_SERVICE_TIER;
      }
      if (patch.models !== undefined) {
        const bad = await unknownModelsError(deps.modelCatalog, patch.models);
        if (bad) return bad;
      }
      if (patch.rateLimit !== undefined) {
        const rl = patch.rateLimit as Partial<RateLimitConfig>;
        if (
          rl.wiseMultiplier !== undefined &&
          (typeof rl.wiseMultiplier !== "number" || !(rl.wiseMultiplier >= 1))
        ) {
          return BAD_RATE_LIMIT_MULTIPLIER;
        }
        for (const v of [rl.fiveHourTokens, rl.weeklyTokens]) {
          if (
            v !== undefined &&
            (typeof v !== "number" || !Number.isFinite(v) || v < 0)
          ) {
            return BAD_RATE_LIMIT_TOKENS;
          }
        }
      }
      if (patch.expandableBlockquoteThreshold !== undefined) {
        const v = patch.expandableBlockquoteThreshold;
        if (
          typeof v !== "number" ||
          !Number.isFinite(v) ||
          !Number.isInteger(v) ||
          v < 0
        ) {
          return BAD_EXPANDABLE_THRESHOLD;
        }
      }
      if (patch.maxRemindersPerUser !== undefined) {
        const v = patch.maxRemindersPerUser;
        if (
          typeof v !== "number" ||
          !Number.isFinite(v) ||
          !Number.isInteger(v) ||
          v < 1
        ) {
          return BAD_MAX_REMINDERS;
        }
      }
      if (
        patch.whitelistEnabled !== undefined &&
        typeof patch.whitelistEnabled !== "boolean"
      ) {
        return BAD_WHITELIST_ENABLED;
      }
      if (
        patch.budget !== undefined &&
        !validateBudgetPatch(patch.budget as Partial<BudgetConfig>)
      ) {
        return BAD_BUDGET;
      }
      if (
        patch.anomaly !== undefined &&
        !validateAnomalyPatch(patch.anomaly as Partial<AnomalyConfig>)
      ) {
        return BAD_ANOMALY;
      }
      const next: Settings = {
        ...current,
        ...patch,
        rateLimit: { ...current.rateLimit, ...patch.rateLimit },
        budget: { ...current.budget, ...patch.budget },
        anomaly: { ...current.anomaly, ...patch.anomaly },
      };
      await deps.storage.settings.save(next);
      return { status: 200, body: next };
    },
  },
];
