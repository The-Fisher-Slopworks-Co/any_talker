// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { Storage } from "../storage/types";
import type { RateLimiter } from "../ratelimit/types";
import type {
  Chat,
  Settings,
  User,
  WhitelistEntry,
  ChatSettings,
  RateLimitConfig,
  Gender,
  BucketState,
} from "../shared/types";
import {
  isValidTimezone,
  isValidProviderSort,
  isValidServiceTier,
  isValidGender,
} from "../shared/types";
import { isValidLang, type Lang } from "../shared/i18n";
import {
  validateDisplayName,
  readValidDisplayName,
  type DisplayNameError,
} from "../shared/display-name";
import type { Reminder } from "../reminders/types";
import type { RecurringCheck } from "../checks/types";
import type { SpendSummary } from "../spending/window";
import { normalizeCheckInput } from "../checks/validate";
import { getOrInitSettings } from "../settings";
import {
  isValidPermaslug,
  type FetchOpenRouterStats,
} from "./openrouter-proxy";

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

export type ApiDeps = {
  storage: Storage;
  rateLimiter: RateLimiter;
  ownerId: string;
  fetchOpenRouterStats?: FetchOpenRouterStats;
};

const FORBIDDEN: ApiResponse = { status: 403, body: { error: "forbidden" } };

function badDisplayName(reason: DisplayNameError): ApiResponse {
  return {
    status: 400,
    body: { error: "invalid display name", reason },
  };
}

export type UserBucketEntry = { chat: Chat; bucket: BucketState };

// Rate-limit buckets are keyed per (chat, user), so a user has a distinct
// bucket in every chat they talk in. Walk the known chats and collect the
// ones where this user has a bucket.
async function listUserBuckets(
  storage: Storage,
  userId: string,
): Promise<UserBucketEntry[]> {
  const chats = await storage.listChats();
  const entries = await Promise.all(
    chats.map(async (chat) => {
      const bucket = await storage.getBucket(chat.id, userId);
      return bucket ? { chat, bucket } : null;
    }),
  );
  return entries.filter((e): e is UserBucketEntry => e !== null);
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

const BAD_GENDER: ApiResponse = {
  status: 400,
  body: { error: "invalid gender" },
};

const BAD_LANG: ApiResponse = {
  status: 400,
  body: { error: "invalid language" },
};

const BAD_OPENROUTER_KEY: ApiResponse = {
  status: 400,
  body: { error: "invalid openrouter key" },
};

const BAD_OPENROUTER_MODELS: ApiResponse = {
  status: 400,
  body: {
    error: "models must be null or an array of non-empty strings",
  },
};

const MAX_OPENROUTER_KEY_LENGTH = 256;
const MAX_OPENROUTER_USER_MODELS = 10;

function openrouterKeyResponse(
  key: string | null,
): { hasKey: boolean; last4: string | null } {
  if (key === null) return { hasKey: false, last4: null };
  return { hasKey: true, last4: key.slice(-4) };
}

function normalizeUserModelsPatch(
  input: unknown,
): { ok: true; value: string[] | null } | { ok: false } {
  if (input === null || input === undefined) return { ok: true, value: null };
  if (!Array.isArray(input)) return { ok: false };
  if (input.length > MAX_OPENROUTER_USER_MODELS) return { ok: false };
  const trimmed: string[] = [];
  for (const m of input) {
    if (typeof m !== "string") return { ok: false };
    const t = m.trim();
    if (t.length === 0) continue;
    trimmed.push(t);
  }
  return { ok: true, value: trimmed.length > 0 ? trimmed : null };
}

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

const BAD_PROVIDER_SORT: ApiResponse = {
  status: 400,
  body: { error: "invalid providerSort" },
};

const BAD_SERVICE_TIER: ApiResponse = {
  status: 400,
  body: { error: "invalid serviceTier" },
};

const BAD_MODELS: ApiResponse = {
  status: 400,
  body: { error: "models must be a non-empty array of non-empty strings" },
};

const BAD_RATE_LIMIT_MULTIPLIER: ApiResponse = {
  status: 400,
  body: { error: "rate-limit multipliers must be positive numbers" },
};

const BAD_EXPANDABLE_THRESHOLD: ApiResponse = {
  status: 400,
  body: {
    error: "expandableBlockquoteThreshold must be a non-negative integer",
  },
};

function isValidModelsList(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((m) => typeof m === "string" && m.trim().length > 0)
  );
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
    rateLimit?: unknown;
    botName?: unknown;
    timezone?: unknown;
    providerSort?: unknown;
    serviceTier?: unknown;
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
  if (
    body.rateLimit &&
    typeof body.rateLimit === "object" &&
    !Array.isArray(body.rateLimit)
  ) {
    const r = body.rateLimit as Partial<RateLimitConfig>;
    if (
      typeof r.capacity === "number" &&
      typeof r.refillAmount === "number" &&
      typeof r.refillIntervalMs === "number" &&
      typeof r.ownerExempt === "boolean" &&
      typeof r.wiseMultiplier === "number" &&
      r.wiseMultiplier > 0
    ) {
      out.rateLimit = {
        capacity: r.capacity,
        refillAmount: r.refillAmount,
        refillIntervalMs: r.refillIntervalMs,
        ownerExempt: r.ownerExempt,
        wiseMultiplier: r.wiseMultiplier,
      };
    }
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
  if (body.providerSort === null) {
    out.providerSort = null;
  } else if (isValidProviderSort(body.providerSort)) {
    out.providerSort = body.providerSort;
  }
  if (body.serviceTier === null) {
    out.serviceTier = null;
  } else if (isValidServiceTier(body.serviceTier)) {
    out.serviceTier = body.serviceTier;
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

  if (req.path === "/api/me/openrouter-key") {
    if (req.method === "GET") {
      const key = await deps.storage.getUserOpenrouterKey(actor.userId);
      return { status: 200, body: openrouterKeyResponse(key) };
    }
    if (req.method === "PUT") {
      const body = (req.body ?? {}) as { key?: unknown };
      let next: string | null;
      if (body.key === null || body.key === undefined) {
        next = null;
      } else if (typeof body.key === "string") {
        const trimmed = body.key.trim();
        if (trimmed === "") {
          next = null;
        } else if (trimmed.length > MAX_OPENROUTER_KEY_LENGTH) {
          return BAD_OPENROUTER_KEY;
        } else {
          next = trimmed;
        }
      } else {
        return BAD_OPENROUTER_KEY;
      }
      await deps.storage.setUserOpenrouterKey(actor.userId, next);
      return { status: 200, body: openrouterKeyResponse(next) };
    }
  }

  if (req.path === "/api/me/openrouter-models") {
    if (req.method === "GET") {
      const models = await deps.storage.getUserOpenrouterModels(actor.userId);
      return { status: 200, body: { models } };
    }
    if (req.method === "PUT") {
      const body = (req.body ?? {}) as { models?: unknown };
      const parsed = normalizeUserModelsPatch(body.models);
      if (!parsed.ok) return BAD_OPENROUTER_MODELS;
      await deps.storage.setUserOpenrouterModels(actor.userId, parsed.value);
      return { status: 200, body: { models: parsed.value } };
    }
  }

  if (req.path === "/api/me/spending" && req.method === "GET") {
    const spending = await deps.storage.getUserSpend(actor.userId, Date.now());
    return { status: 200, body: { spending } };
  }

  // OpenRouter endpoint metadata is read by the BYOK model picker (non-admin
  // users) as well as the admin views, so this handler intentionally sits
  // above the owner gate below. Anything added here must stay safe to expose
  // to any authenticated Telegram Mini App user.
  const orMatch = req.path.match(/^\/api\/openrouter\/endpoints\/(.+)$/);
  if (orMatch && req.method === "GET") {
    const permaslug = decodeURIComponent(orMatch[1]!);
    if (!isValidPermaslug(permaslug)) {
      return { status: 400, body: { error: "invalid permaslug" } };
    }
    if (!deps.fetchOpenRouterStats) {
      return { status: 503, body: { error: "stats fetcher not configured" } };
    }
    try {
      const data = await deps.fetchOpenRouterStats(permaslug);
      return { status: 200, body: data };
    } catch (err) {
      // Log the upstream error but return a generic code: the message can
      // contain internal paths / stack fragments that we shouldn't expose
      // through the Mini App to non-admin users.
      console.error("openrouter stats fetch failed:", err);
      return { status: 502, body: { error: "openrouter_stats_failed" } };
    }
  }

  // Everything below this line is admin-only.
  if (!actor.isOwner) return FORBIDDEN;

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
      if (
        patch.providerSort !== undefined &&
        patch.providerSort !== null &&
        !isValidProviderSort(patch.providerSort)
      ) {
        return BAD_PROVIDER_SORT;
      }
      if (
        patch.serviceTier !== undefined &&
        patch.serviceTier !== null &&
        !isValidServiceTier(patch.serviceTier)
      ) {
        return BAD_SERVICE_TIER;
      }
      if (patch.models !== undefined && !isValidModelsList(patch.models)) {
        return BAD_MODELS;
      }
      if (patch.rateLimit !== undefined) {
        const rl = patch.rateLimit as Partial<RateLimitConfig>;
        if (
          rl.wiseMultiplier !== undefined &&
          (typeof rl.wiseMultiplier !== "number" || !(rl.wiseMultiplier > 0))
        ) {
          return BAD_RATE_LIMIT_MULTIPLIER;
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
      const next: Settings = {
        ...current,
        ...patch,
        rateLimit: { ...current.rateLimit, ...(patch.rateLimit ?? {}) },
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
      const bucket = await deps.storage.getBucket(deps.ownerId, deps.ownerId);
      return { status: 200, body: { bucket } };
    }
    if (req.method === "PUT") {
      const settings = await getOrInitSettings(deps.storage);
      const body = (req.body ?? {}) as { reset?: boolean };
      if (body.reset) {
        await deps.rateLimiter.reset(
          deps.ownerId,
          deps.ownerId,
          settings.rateLimit,
          Date.now(),
        );
      }
      const bucket = await deps.storage.getBucket(deps.ownerId, deps.ownerId);
      return { status: 200, body: { bucket } };
    }
  }

  const rlUserMatch = req.path.match(/^\/api\/ratelimit\/user\/(.+)$/);
  if (rlUserMatch) {
    const id = rlUserMatch[1]!;
    if (req.method === "GET") {
      const buckets = await listUserBuckets(deps.storage, id);
      return { status: 200, body: { buckets } };
    }
    if (req.method === "PUT") {
      const body = (req.body ?? {}) as { chatId?: string; reset?: boolean };
      if (body.reset && typeof body.chatId === "string") {
        const settings = await getOrInitSettings(deps.storage);
        await deps.rateLimiter.reset(
          body.chatId,
          id,
          settings.rateLimit,
          Date.now(),
        );
      }
      const buckets = await listUserBuckets(deps.storage, id);
      return { status: 200, body: { buckets } };
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
      await deps.storage.saveChatSettings(id, next);
      return { status: 200, body: { chat, settings: next } };
    }
  }

  return { status: 404, body: { error: "not found" } };
}
