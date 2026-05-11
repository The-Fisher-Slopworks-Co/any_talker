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
} from "../shared/types";
import {
  isValidTimezone,
  isValidProviderSort,
  isValidGender,
} from "../shared/types";
import { isValidLang, type Lang } from "../shared/i18n";
import type { Reminder } from "../reminders/types";
import type { RecurringCheck } from "../checks/types";
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

function normalizeDisplayName(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  return trimmed.length > 0 ? trimmed : null;
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

const BAD_MODELS: ApiResponse = {
  status: 400,
  body: { error: "models must be a non-empty array of non-empty strings" },
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
): Promise<Record<string, User>> {
  const ids = new Set<string>(reminders.map((r) => r.userId));
  if (ids.size === 0) return {};
  const entries = await Promise.all(
    [...ids].map(async (id) => [id, await storage.getUser(id)] as const),
  );
  const out: Record<string, User> = {};
  for (const [id, user] of entries) {
    if (user) out[id] = user;
  }
  return out;
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
  const [chats, users] = await Promise.all([
    collectReminderChats(storage, reminders),
    collectReminderUsers(storage, reminders),
  ]);
  return { status: 200, body: { reminders, chats, users } };
}

function normalizeChatSettings(raw: unknown): ChatSettings {
  const body = (raw ?? {}) as {
    systemPrompt?: unknown;
    models?: unknown;
    rateLimit?: unknown;
    botName?: unknown;
    timezone?: unknown;
    providerSort?: unknown;
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
      typeof r.ownerExempt === "boolean"
    ) {
      out.rateLimit = {
        capacity: r.capacity,
        refillAmount: r.refillAmount,
        refillIntervalMs: r.refillIntervalMs,
        ownerExempt: r.ownerExempt,
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
        deps.storage.getUserName(actor.userId),
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
          deps.storage.getUserName(actor.userId),
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
        displayName = normalizeDisplayName(body.displayName);
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
      if (patch.models !== undefined && !isValidModelsList(patch.models)) {
        return BAD_MODELS;
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
      return {
        status: 502,
        body: { error: err instanceof Error ? err.message : String(err) },
      };
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
    const users = await deps.storage.listUsers();
    return { status: 200, body: { users } };
  }

  if (req.path === "/api/admin/reminders" && req.method === "GET") {
    return respondAdminReminders(
      deps.storage,
      await deps.storage.listAllReminders(),
    );
  }

  const userMatch = req.path.match(/^\/api\/admin\/users\/(.+)$/);
  if (userMatch) {
    const id = userMatch[1]!;
    if (req.method === "GET") {
      const [user, displayName, whitelisted] = await Promise.all([
        deps.storage.getUser(id),
        deps.storage.getUserName(id),
        deps.storage.isWhitelisted("users", id),
      ]);
      if (!user) return { status: 404, body: { error: "user not found" } };
      return { status: 200, body: { user, displayName, whitelisted } };
    }
    if (req.method === "PUT") {
      const user = await deps.storage.getUser(id);
      if (!user) return { status: 404, body: { error: "user not found" } };
      const body = (req.body ?? {}) as { displayName?: string | null };
      const displayName = normalizeDisplayName(body.displayName);
      await deps.storage.setUserName(id, displayName);
      return { status: 200, body: { user, displayName } };
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
