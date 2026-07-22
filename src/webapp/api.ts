// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { USER_FACTS_MAX_PER_USER, type Storage } from "../storage/types";
import type { RateLimiter } from "../ratelimit/types";
import { normalizeFactKey, normalizeFactValue } from "../shared/user-facts";
import type {
  Chat,
  Settings,
  User,
  WhitelistEntry,
  ChatSettings,
  RateLimitConfig,
  BudgetConfig,
  AnomalyConfig,
  Gender,
} from "../shared/types";
import { isValidTimezone, isValidGender } from "../shared/types";
import { isValidLang, type Lang } from "../shared/i18n";
import {
  validateDisplayName,
  readValidDisplayName,
  type DisplayNameError,
} from "../shared/display-name";
import type { Reminder } from "../reminders/types";
import type { RecurringCheck } from "../checks/types";
import type { ManagedBot } from "../managed-bots/types";
import type { SpendSummary } from "../spending/window";
import { normalizeCheckInput } from "../checks/validate";
import { normalizeManagedBotInput } from "../managed-bots/validate";
import { getOrInitSettings } from "../settings";
import { gatherSpendOverview } from "../spending/overview";
import { summarizeUsage, type UsageStatus } from "../ratelimit/window";
import type { ModelCatalog } from "../ai/model-catalog";

export type ApiRequest = {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  body: unknown;
};

export type ApiResponse = { status: number; body: unknown };

export type ApiActor = {
  userId: string;
  isOwner: boolean;
};

// The slice of the BotManager the API needs: enough to mutate a running bot's
// live state (avatar, name), tear it down, and surface creation prerequisites.
// Narrowed so api.ts stays decoupled from grammY and is testable with a stub.
export type ManagedBotController = {
  isRunning(botId: string): boolean;
  setAvatar(botId: string, bytes: Uint8Array): Promise<boolean>;
  deleteBot(botId: string): Promise<void>;
  syncProfileName(botId: string): Promise<void>;
  managerInfo(): Promise<{ username: string | null; canManageBots: boolean }>;
};

export type ApiDeps = {
  storage: Storage;
  rateLimiter: RateLimiter;
  ownerId: string;
  modelCatalog?: ModelCatalog;
  managedBots?: ManagedBotController;
};

const FORBIDDEN: ApiResponse = { status: 403, body: { error: "forbidden" } };

const MANAGED_BOTS_UNAVAILABLE: ApiResponse = {
  status: 503,
  body: { error: "managed bots not available" },
};

// Avatars arrive as a base64 string (optionally a data URL) in the JSON body, so
// the server stays JSON-only with no multipart handling. Capped to bound memory.
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

function decodeBase64Image(input: unknown): Uint8Array | null {
  if (typeof input !== "string" || input.length === 0) return null;
  const comma = input.indexOf(",");
  const b64 =
    input.startsWith("data:") && comma >= 0 ? input.slice(comma + 1) : input;
  try {
    const bytes = Uint8Array.from(Buffer.from(b64, "base64"));
    if (bytes.length === 0 || bytes.length > MAX_AVATAR_BYTES) return null;
    return bytes;
  } catch {
    return null;
  }
}

function badDisplayName(reason: DisplayNameError): ApiResponse {
  return {
    status: 400,
    body: { error: "invalid display name", reason },
  };
}

// The dual-window usage is per user and global, so a single record describes a
// user everywhere. Resolved against the current config + windows for display.
async function userUsageStatus(
  storage: Storage,
  userId: string,
  config: RateLimitConfig,
  now: number,
): Promise<UsageStatus> {
  const stored = await storage.getUserUsage(userId);
  return summarizeUsage(userId, config, stored, now);
}

function normalizeTimezoneOrNull(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (trimmed.length === 0 || !isValidTimezone(trimmed)) return null;
  return trimmed;
}

const BAD_TIMEZONE: ApiResponse = {
  status: 400,
  body: { error: "invalid timezone" },
};

// --- Memory vault (user facts) responses & helpers ---

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
const FACTS_BOT_NOT_FOUND: ApiResponse = {
  status: 404,
  body: { error: "bot not found" },
};

// The vault addresses a character by URL scope: the literal "main" is the main
// bot (forBot(null)); anything else must be a registered managed bot's id.
// Telegram bot ids are numeric, so "main" can never collide with a real id.
const MAIN_BOT_SCOPE = "main";

async function resolveFactsStorage(
  storage: Storage,
  scope: string,
): Promise<Storage | null> {
  if (scope === MAIN_BOT_SCOPE) return storage.forBot(null);
  const bot = await storage.getManagedBot(scope);
  return bot ? storage.forBot(scope) : null;
}

// Every vault mutation returns the fresh list (like the whitelist routes), so
// the client can replace its state without a second round trip. The cap rides
// along so the UI never hardcodes it.
async function respondFacts(
  scoped: Storage,
  userId: string,
): Promise<ApiResponse> {
  const facts = await scoped.listUserFacts(userId);
  return { status: 200, body: { facts, cap: USER_FACTS_MAX_PER_USER } };
}

const BAD_GENDER: ApiResponse = {
  status: 400,
  body: { error: "invalid gender" },
};

const BAD_LANG: ApiResponse = {
  status: 400,
  body: { error: "invalid language" },
};

function normalizeEnumInput<T extends string>(
  input: unknown,
  isValid: (v: string) => v is T,
): T | null | "invalid" {
  if (input === null || input === undefined) return null;
  if (typeof input !== "string") return "invalid";
  const trimmed = input.trim();
  if (trimmed === "") return null;
  return isValid(trimmed) ? trimmed : "invalid";
}

const BAD_MODELS: ApiResponse = {
  status: 400,
  body: { error: "models must be a non-empty array of non-empty strings" },
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

const nonNegNum = (v: unknown): boolean =>
  v === undefined || (typeof v === "number" && Number.isFinite(v) && v >= 0);
const posIntOrUndef = (v: unknown): boolean =>
  v === undefined ||
  (typeof v === "number" && Number.isInteger(v) && v >= 1);
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

// Rejects models absent from the configured `/v1/models` catalogue. Returns null
// (allow) when no catalogue is configured or when every id is known; the
// catalogue itself returns "all allowed" when its list is empty/unavailable, so
// saves never get trapped just because the endpoint exposes no model list.
async function unknownModelsError(
  catalog: ModelCatalog | undefined,
  models: string[],
): Promise<ApiResponse | null> {
  if (!catalog) return null;
  const unknown = await catalog.unknownModels(models);
  if (unknown.length === 0) return null;
  return { status: 400, body: { error: "unknown model", models: unknown } };
}

async function collectReminderChats(
  storage: Storage,
  reminders: Reminder[],
): Promise<Record<string, Chat>> {
  const ids = new Set<string>();
  for (const r of reminders) {
    if (r.target.kind === "ask_reply") ids.add(r.target.chatId);
  }
  if (ids.size === 0) return {};
  const entries = await Promise.all(
    [...ids].map(async (id) => [id, await storage.getChat(id)] as const),
  );
  const out: Record<string, Chat> = {};
  for (const [id, chat] of entries) {
    if (chat) out[id] = chat;
  }
  return out;
}

async function collectReminderUsers(
  storage: Storage,
  reminders: Reminder[],
): Promise<{
  users: Record<string, User>;
  displayNames: Record<string, string | null>;
}> {
  const ids = new Set<string>(reminders.map((r) => r.userId));
  if (ids.size === 0) return { users: {}, displayNames: {} };
  const entries = await Promise.all(
    [...ids].map(
      async (id) =>
        [
          id,
          await storage.getUser(id),
          await readValidDisplayName(storage, id),
        ] as const,
    ),
  );
  const users: Record<string, User> = {};
  const displayNames: Record<string, string | null> = {};
  for (const [id, user, displayName] of entries) {
    if (user) users[id] = user;
    displayNames[id] = displayName;
  }
  return { users, displayNames };
}

async function respondMyReminders(
  storage: Storage,
  reminders: Reminder[],
): Promise<ApiResponse> {
  const chats = await collectReminderChats(storage, reminders);
  return { status: 200, body: { reminders, chats } };
}

async function respondAdminReminders(
  storage: Storage,
  reminders: Reminder[],
): Promise<ApiResponse> {
  const [chats, { users, displayNames }] = await Promise.all([
    collectReminderChats(storage, reminders),
    collectReminderUsers(storage, reminders),
  ]);
  return { status: 200, body: { reminders, chats, users, displayNames } };
}

function normalizeChatSettings(raw: unknown): ChatSettings {
  const body = (raw ?? {}) as {
    systemPrompt?: unknown;
    models?: unknown;
    botName?: unknown;
    timezone?: unknown;
    keywordFilter?: unknown;
  };
  const out: ChatSettings = {};
  if (typeof body.systemPrompt === "string") {
    out.systemPrompt = body.systemPrompt;
  }
  if (
    Array.isArray(body.models) &&
    body.models.every((m) => typeof m === "string") &&
    body.models.length > 0
  ) {
    out.models = body.models as string[];
  }
  if (typeof body.botName === "string") {
    const trimmed = body.botName.trim();
    if (trimmed.length > 0) out.botName = trimmed;
  }
  if (typeof body.timezone === "string") {
    const trimmed = body.timezone.trim();
    if (trimmed.length > 0 && isValidTimezone(trimmed)) {
      out.timezone = trimmed;
    }
  }
  if (
    body.keywordFilter &&
    typeof body.keywordFilter === "object" &&
    !Array.isArray(body.keywordFilter)
  ) {
    const f = body.keywordFilter as {
      enabled?: unknown;
      keywords?: unknown;
    };
    const keywords = Array.isArray(f.keywords)
      ? f.keywords
          .filter((k): k is string => typeof k === "string")
          .map((k) => k.trim())
          .filter((k) => k.length > 0)
      : [];
    const enabled = typeof f.enabled === "boolean" ? f.enabled : false;
    if (enabled || keywords.length > 0) {
      out.keywordFilter = { enabled, keywords };
    }
  }
  return out;
}

export async function handleApi(
  req: ApiRequest,
  deps: ApiDeps,
  actor: ApiActor,
): Promise<ApiResponse> {
  if (req.path === "/api/me/reminders" && req.method === "GET") {
    return respondMyReminders(
      deps.storage,
      await deps.storage.listRemindersForUser(actor.userId),
    );
  }

  if (req.path === "/api/me") {
    if (req.method === "GET") {
      const [displayName, timezone, gender, language] = await Promise.all([
        readValidDisplayName(deps.storage, actor.userId),
        deps.storage.getUserTimezone(actor.userId),
        deps.storage.getUserGender(actor.userId),
        deps.storage.getUserLang(actor.userId),
      ]);
      return {
        status: 200,
        body: {
          isOwner: actor.isOwner,
          displayName,
          timezone,
          gender,
          language,
        },
      };
    }
    if (req.method === "PUT") {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const [currentName, currentTz, currentGender, currentLang] =
        await Promise.all([
          readValidDisplayName(deps.storage, actor.userId),
          deps.storage.getUserTimezone(actor.userId),
          deps.storage.getUserGender(actor.userId),
          deps.storage.getUserLang(actor.userId),
        ]);
      let displayName = currentName;
      let timezone = currentTz;
      let gender: Gender | null = currentGender;
      let language: Lang | null = currentLang;
      const writes: Promise<void>[] = [];

      if ("displayName" in body) {
        const r = validateDisplayName(body.displayName);
        if (!r.ok) return badDisplayName(r.reason);
        displayName = r.value;
        writes.push(deps.storage.setUserName(actor.userId, displayName));
      }
      if ("timezone" in body) {
        if (typeof body.timezone === "string" && body.timezone.trim() !== "") {
          const next = normalizeTimezoneOrNull(body.timezone);
          if (next === null) return BAD_TIMEZONE;
          timezone = next;
        } else {
          timezone = null;
        }
        writes.push(deps.storage.setUserTimezone(actor.userId, timezone));
      }
      if ("gender" in body) {
        const nextGender = normalizeEnumInput(body.gender, isValidGender);
        if (nextGender === "invalid") return BAD_GENDER;
        gender = nextGender;
        writes.push(deps.storage.setUserGender(actor.userId, gender));
      }
      if ("language" in body) {
        const nextLang = normalizeEnumInput(body.language, isValidLang);
        if (nextLang === "invalid") return BAD_LANG;
        language = nextLang;
        writes.push(deps.storage.setUserLang(actor.userId, language));
      }

      await Promise.all(writes);
      return {
        status: 200,
        body: {
          isOwner: actor.isOwner,
          displayName,
          timezone,
          gender,
          language,
        },
      };
    }
  }

  if (req.path === "/api/me/spending" && req.method === "GET") {
    const spending = await deps.storage.getUserSpend(actor.userId, Date.now());
    return { status: 200, body: { spending } };
  }

  // Memory vault: the family roster for the character switcher. A narrow DTO
  // on purpose — never the raw ManagedBot, which carries systemPrompt and
  // ownerUserId that a non-owner must not see. Bot names/usernames are already
  // public via Telegram, so exposing the roster to any authenticated user is fine.
  if (req.path === "/api/me/bots" && req.method === "GET") {
    const managed = await deps.storage.listManagedBots();
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
  }

  // Memory vault: a user reads/edits the facts a character remembers about
  // them. Scoped strictly to actor.userId — the id never comes from the request.
  const factsCollection = req.path.match(/^\/api\/me\/facts\/([^/]+)$/);
  if (factsCollection) {
    const scoped = await resolveFactsStorage(deps.storage, factsCollection[1]!);
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
      const existing = await scoped.listUserFacts(actor.userId);
      const isUpdate = existing.some((f) => f.key === key);
      if (!isUpdate && existing.length >= USER_FACTS_MAX_PER_USER) {
        return FACTS_LIMIT_REACHED;
      }
      await scoped.rememberUserFact(actor.userId, key, value);
      return respondFacts(scoped, actor.userId);
    }
  }

  const factsItem = req.path.match(/^\/api\/me\/facts\/([^/]+)\/([^/]+)$/);
  if (factsItem) {
    const scoped = await resolveFactsStorage(deps.storage, factsItem[1]!);
    if (!scoped) return FACTS_BOT_NOT_FOUND;
    // The key charset ([a-z0-9_]) is URL-safe, so the path segment is the key
    // verbatim; anything else fails normalization here.
    const key = normalizeFactKey(factsItem[2]!);
    if (key === null) return BAD_FACT_KEY;

    if (req.method === "PUT") {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const value = normalizeFactValue(body.value);
      if (value === null) return BAD_FACT_VALUE;
      const facts = await scoped.listUserFacts(actor.userId);
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
        await scoped.forgetUserFact(actor.userId, key);
      }
      await scoped.rememberUserFact(actor.userId, nextKey, value);
      return respondFacts(scoped, actor.userId);
    }

    if (req.method === "DELETE") {
      // Idempotent: deleting an already-gone fact succeeds, mirroring
      // forget_fact's {existed:false}-is-not-an-error semantics.
      await scoped.forgetUserFact(actor.userId, key);
      return respondFacts(scoped, actor.userId);
    }
  }

  // Everything below this line is admin-only.
  if (!actor.isOwner) return FORBIDDEN;

  // The model catalogue feeds the admin model picker (global + per-chat).
  if (req.path === "/api/models" && req.method === "GET") {
    if (!deps.modelCatalog) {
      return { status: 503, body: { error: "model catalogue not configured" } };
    }
    try {
      const models = await deps.modelCatalog.list();
      return { status: 200, body: { models } };
    } catch (err) {
      console.error("model catalogue fetch failed:", err);
      return { status: 502, body: { error: "model_catalogue_failed" } };
    }
  }

  if (req.path === "/api/settings") {
    if (req.method === "GET") {
      const s = await getOrInitSettings(deps.storage);
      return { status: 200, body: s };
    }
    if (req.method === "PUT") {
      const current = await getOrInitSettings(deps.storage);
      const patch = (req.body ?? {}) as Partial<Settings>;
      if (patch.timezone !== undefined && !isValidTimezone(patch.timezone)) {
        return BAD_TIMEZONE;
      }
      if (patch.models !== undefined && !isValidModelsList(patch.models)) {
        return BAD_MODELS;
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
        rateLimit: { ...current.rateLimit, ...(patch.rateLimit ?? {}) },
        budget: { ...current.budget, ...(patch.budget ?? {}) },
        anomaly: { ...current.anomaly, ...(patch.anomaly ?? {}) },
      };
      await deps.storage.saveSettings(next);
      return { status: 200, body: next };
    }
  }

  if (req.path === "/api/whitelist" && req.method === "GET") {
    const [users, chats] = await Promise.all([
      deps.storage.listWhitelist("users"),
      deps.storage.listWhitelist("chats"),
    ]);
    return { status: 200, body: { users, chats } };
  }

  for (const kind of ["users", "chats"] as const) {
    if (req.path === `/api/whitelist/${kind}` && req.method === "POST") {
      const body = (req.body ?? {}) as Partial<WhitelistEntry>;
      if (typeof body.id !== "string" || body.id.length === 0) {
        return { status: 400, body: { error: "id required" } };
      }
      await deps.storage.addWhitelist(kind, { id: body.id, label: body.label });
      const list = await deps.storage.listWhitelist(kind);
      return { status: 200, body: list };
    }
    const m = req.path.match(new RegExp(`^/api/whitelist/${kind}/(.+)$`));
    if (m && req.method === "DELETE") {
      await deps.storage.removeWhitelist(kind, m[1]!);
      const list = await deps.storage.listWhitelist(kind);
      return { status: 200, body: list };
    }
  }

  if (req.path === "/api/admin/users" && req.method === "GET") {
    const now = Date.now();
    const users = await deps.storage.listUsers();
    const rows = await Promise.all(
      users.map(
        async (u) =>
          [
            u.id,
            await readValidDisplayName(deps.storage, u.id),
            await deps.storage.getUserSpend(u.id, now),
          ] as const,
      ),
    );
    const displayNames: Record<string, string | null> = {};
    const spending: Record<string, SpendSummary> = {};
    for (const [id, name, spend] of rows) {
      displayNames[id] = name;
      spending[id] = spend;
    }
    return { status: 200, body: { users, displayNames, spending } };
  }

  if (req.path === "/api/admin/reminders" && req.method === "GET") {
    return respondAdminReminders(
      deps.storage,
      await deps.storage.listAllReminders(),
    );
  }

  // Consolidated spend dashboard: global aggregate, top spenders (users +
  // chats), per-model breakdown, denial leaderboard, and entities first seen in
  // the last 7 days.
  if (req.path === "/api/admin/spend/overview" && req.method === "GET") {
    const now = Date.now();
    const overview = await gatherSpendOverview(deps.storage, now, {
      limit: 10,
      newSinceMs: now - 7 * 24 * 60 * 60 * 1000,
    });
    return { status: 200, body: overview };
  }

  const userSpendMatch = req.path.match(
    /^\/api\/admin\/users\/(.+)\/spending$/,
  );
  if (userSpendMatch && req.method === "GET") {
    const spending = await deps.storage.getUserSpend(
      userSpendMatch[1]!,
      Date.now(),
    );
    return { status: 200, body: { spending } };
  }

  // Read-only admin view into a user's memory vault, per character scope —
  // the same records the /api/me/facts routes serve, addressed by an explicit
  // user id. Deliberately GET-only: edits stay with the user (and the AI tools),
  // the admin only inspects.
  const userFactsMatch = req.path.match(
    /^\/api\/admin\/users\/([^/]+)\/facts\/([^/]+)$/,
  );
  if (userFactsMatch && req.method === "GET") {
    const scoped = await resolveFactsStorage(deps.storage, userFactsMatch[2]!);
    if (!scoped) return FACTS_BOT_NOT_FOUND;
    return respondFacts(scoped, userFactsMatch[1]!);
  }

  const userMatch = req.path.match(/^\/api\/admin\/users\/(.+)$/);
  if (userMatch) {
    const id = userMatch[1]!;
    if (req.method === "GET") {
      const [user, displayName, timezone, gender, language, whitelisted] =
        await Promise.all([
          deps.storage.getUser(id),
          readValidDisplayName(deps.storage, id),
          deps.storage.getUserTimezone(id),
          deps.storage.getUserGender(id),
          deps.storage.getUserLang(id),
          deps.storage.isWhitelisted("users", id),
        ]);
      if (!user) return { status: 404, body: { error: "user not found" } };
      return {
        status: 200,
        body: { user, displayName, timezone, gender, language, whitelisted },
      };
    }
    if (req.method === "PUT") {
      const user = await deps.storage.getUser(id);
      if (!user) return { status: 404, body: { error: "user not found" } };
      const body = (req.body ?? {}) as Record<string, unknown>;
      const [currentName, currentTz, currentGender, currentLang] =
        await Promise.all([
          readValidDisplayName(deps.storage, id),
          deps.storage.getUserTimezone(id),
          deps.storage.getUserGender(id),
          deps.storage.getUserLang(id),
        ]);
      let displayName = currentName;
      let timezone = currentTz;
      let gender: Gender | null = currentGender;
      let language: Lang | null = currentLang;
      const writes: Promise<void>[] = [];

      if ("displayName" in body) {
        const r = validateDisplayName(body.displayName);
        if (!r.ok) return badDisplayName(r.reason);
        displayName = r.value;
        writes.push(deps.storage.setUserName(id, displayName));
      }
      if ("timezone" in body) {
        if (typeof body.timezone === "string" && body.timezone.trim() !== "") {
          const next = normalizeTimezoneOrNull(body.timezone);
          if (next === null) return BAD_TIMEZONE;
          timezone = next;
        } else {
          timezone = null;
        }
        writes.push(deps.storage.setUserTimezone(id, timezone));
      }
      if ("gender" in body) {
        const nextGender = normalizeEnumInput(body.gender, isValidGender);
        if (nextGender === "invalid") return BAD_GENDER;
        gender = nextGender;
        writes.push(deps.storage.setUserGender(id, gender));
      }
      if ("language" in body) {
        const nextLang = normalizeEnumInput(body.language, isValidLang);
        if (nextLang === "invalid") return BAD_LANG;
        language = nextLang;
        writes.push(deps.storage.setUserLang(id, language));
      }

      await Promise.all(writes);
      return {
        status: 200,
        body: { user, displayName, timezone, gender, language },
      };
    }
  }

  if (req.path === "/api/ratelimit/me") {
    if (req.method === "GET") {
      const settings = await getOrInitSettings(deps.storage);
      const usage = await userUsageStatus(
        deps.storage,
        deps.ownerId,
        settings.rateLimit,
        Date.now(),
      );
      return { status: 200, body: { usage } };
    }
    if (req.method === "PUT") {
      const settings = await getOrInitSettings(deps.storage);
      const body = (req.body ?? {}) as { reset?: boolean };
      if (body.reset) await deps.rateLimiter.reset(deps.ownerId);
      const usage = await userUsageStatus(
        deps.storage,
        deps.ownerId,
        settings.rateLimit,
        Date.now(),
      );
      return { status: 200, body: { usage } };
    }
  }

  const rlUserMatch = req.path.match(/^\/api\/ratelimit\/user\/(.+)$/);
  if (rlUserMatch) {
    const id = rlUserMatch[1]!;
    if (req.method === "GET") {
      const settings = await getOrInitSettings(deps.storage);
      const usage = await userUsageStatus(
        deps.storage,
        id,
        settings.rateLimit,
        Date.now(),
      );
      return { status: 200, body: { usage } };
    }
    if (req.method === "PUT") {
      const body = (req.body ?? {}) as { reset?: boolean };
      if (body.reset) await deps.rateLimiter.reset(id);
      const settings = await getOrInitSettings(deps.storage);
      const usage = await userUsageStatus(
        deps.storage,
        id,
        settings.rateLimit,
        Date.now(),
      );
      return { status: 200, body: { usage } };
    }
  }

  if (req.path === "/api/admin/chats" && req.method === "GET") {
    const chats = await deps.storage.listChats();
    return { status: 200, body: { chats } };
  }

  if (req.path === "/api/admin/checks") {
    if (req.method === "GET") {
      const checks = await deps.storage.listChecks();
      return { status: 200, body: { checks } };
    }
    if (req.method === "POST") {
      const parsed = normalizeCheckInput(req.body);
      if (!parsed.ok) {
        return { status: 400, body: { error: parsed.error } };
      }
      const now = Date.now();
      const check: RecurringCheck = {
        id: crypto.randomUUID(),
        ...parsed.value,
        lastFiredAtMs: 0,
        pendingMessageId: null,
        pendingFiredAtMs: null,
        createdAtMs: now,
      };
      await deps.storage.saveCheck(check);
      return { status: 200, body: { check } };
    }
  }

  const checkMatch = req.path.match(/^\/api\/admin\/checks\/(.+)$/);
  if (checkMatch) {
    const id = checkMatch[1]!;
    if (req.method === "GET") {
      const check = await deps.storage.getCheck(id);
      if (!check) return { status: 404, body: { error: "check not found" } };
      return { status: 200, body: { check } };
    }
    if (req.method === "PUT") {
      const existing = await deps.storage.getCheck(id);
      if (!existing) {
        return { status: 404, body: { error: "check not found" } };
      }
      const parsed = normalizeCheckInput(req.body);
      if (!parsed.ok) {
        return { status: 400, body: { error: parsed.error } };
      }
      const next: RecurringCheck = {
        ...existing,
        ...parsed.value,
      };
      await deps.storage.saveCheck(next);
      return { status: 200, body: { check: next } };
    }
    if (req.method === "DELETE") {
      await deps.storage.deleteCheck(id);
      return { status: 200, body: { ok: true } };
    }
  }

  const chatMatch = req.path.match(/^\/api\/admin\/chats\/(.+)$/);
  if (chatMatch) {
    const id = chatMatch[1]!;
    if (req.method === "GET") {
      const [chat, settings, whitelisted] = await Promise.all([
        deps.storage.getChat(id),
        deps.storage.getChatSettings(id),
        deps.storage.isWhitelisted("chats", id),
      ]);
      if (!chat) return { status: 404, body: { error: "chat not found" } };
      return { status: 200, body: { chat, settings: settings ?? {}, whitelisted } };
    }
    if (req.method === "PUT") {
      const chat = await deps.storage.getChat(id);
      if (!chat) return { status: 404, body: { error: "chat not found" } };
      const next = normalizeChatSettings(req.body);
      if (next.models) {
        const bad = await unknownModelsError(deps.modelCatalog, next.models);
        if (bad) return bad;
      }
      await deps.storage.saveChatSettings(id, next);
      return { status: 200, body: { chat, settings: next } };
    }
  }

  if (req.path === "/api/admin/managed-bots" && req.method === "GET") {
    const bots = await deps.storage.listManagedBots();
    const rows = bots.map((b) => ({
      ...b,
      running: deps.managedBots?.isRunning(b.botId) ?? false,
    }));
    return { status: 200, body: { bots: rows } };
  }

  // Prerequisites for the native creation flow: the main bot's username (to
  // build the `t.me/newbot/{manager}/{suggested}` deep link) and whether bot
  // management is enabled for it in @BotFather. Matched before the `/:id` route.
  if (req.path === "/api/admin/managed-bots/new" && req.method === "GET") {
    if (!deps.managedBots) return MANAGED_BOTS_UNAVAILABLE;
    const info = await deps.managedBots.managerInfo();
    return { status: 200, body: info };
  }

  const mbAvatarMatch = req.path.match(
    /^\/api\/admin\/managed-bots\/([^/]+)\/avatar$/,
  );
  if (mbAvatarMatch && req.method === "PUT") {
    const id = mbAvatarMatch[1]!;
    if (!deps.managedBots) return MANAGED_BOTS_UNAVAILABLE;
    const bytes = decodeBase64Image(
      (req.body as { photoBase64?: unknown } | null)?.photoBase64,
    );
    if (!bytes) return { status: 400, body: { error: "invalid image" } };
    const ok = await deps.managedBots.setAvatar(id, bytes);
    if (!ok) {
      return { status: 502, body: { error: "set_avatar_failed" } };
    }
    return { status: 200, body: { ok: true } };
  }

  const mbMatch = req.path.match(/^\/api\/admin\/managed-bots\/([^/]+)$/);
  if (mbMatch) {
    const id = mbMatch[1]!;
    if (req.method === "GET") {
      const bot = await deps.storage.getManagedBot(id);
      if (!bot) return { status: 404, body: { error: "managed bot not found" } };
      return {
        status: 200,
        body: { bot, running: deps.managedBots?.isRunning(id) ?? false },
      };
    }
    if (req.method === "PUT") {
      const existing = await deps.storage.getManagedBot(id);
      if (!existing) {
        return { status: 404, body: { error: "managed bot not found" } };
      }
      const parsed = normalizeManagedBotInput(req.body);
      if (!parsed.ok) return { status: 400, body: { error: parsed.error } };
      const next: ManagedBot = { ...existing, ...parsed.value };
      await deps.storage.saveManagedBot(next);
      // Push the (possibly changed) display name to Telegram for the live bot.
      await deps.managedBots?.syncProfileName(id);
      return {
        status: 200,
        body: { bot: next, running: deps.managedBots?.isRunning(id) ?? false },
      };
    }
    if (req.method === "DELETE") {
      if (deps.managedBots) {
        await deps.managedBots.deleteBot(id);
      } else {
        await deps.storage.deleteManagedBot(id);
        await deps.storage.setManagedBotToken(id, null);
      }
      return { status: 200, body: { ok: true } };
    }
  }

  return { status: 404, body: { error: "not found" } };
}
