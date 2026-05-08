import type { Storage } from "../storage/types";
import type { RateLimiter } from "../ratelimit/types";
import type {
  Settings,
  WhitelistEntry,
  ChatSettings,
  RateLimitConfig,
} from "../shared/types";
import { getOrInitSettings } from "../settings";

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
};

const FORBIDDEN: ApiResponse = { status: 403, body: { error: "forbidden" } };

function normalizeDisplayName(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeChatSettings(raw: unknown): ChatSettings {
  const body = (raw ?? {}) as {
    systemPrompt?: unknown;
    models?: unknown;
    rateLimit?: unknown;
    botName?: unknown;
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
  return out;
}

export async function handleApi(
  req: ApiRequest,
  deps: ApiDeps,
  actor: ApiActor,
): Promise<ApiResponse> {
  if (req.path === "/api/me") {
    if (req.method === "GET") {
      const displayName = await deps.storage.getUserName(actor.userId);
      return {
        status: 200,
        body: { isOwner: actor.isOwner, displayName },
      };
    }
    if (req.method === "PUT") {
      const body = (req.body ?? {}) as { displayName?: string | null };
      const next = normalizeDisplayName(body.displayName);
      await deps.storage.setUserName(actor.userId, next);
      return {
        status: 200,
        body: { isOwner: actor.isOwner, displayName: next },
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
    const users = await deps.storage.listWhitelist("users");
    const chats = await deps.storage.listWhitelist("chats");
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

  const userMatch = req.path.match(/^\/api\/admin\/users\/(.+)$/);
  if (userMatch) {
    const id = userMatch[1]!;
    if (req.method === "GET") {
      const [user, displayName] = await Promise.all([
        deps.storage.getUser(id),
        deps.storage.getUserName(id),
      ]);
      if (!user) return { status: 404, body: { error: "user not found" } };
      return { status: 200, body: { user, displayName } };
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

  const chatMatch = req.path.match(/^\/api\/admin\/chats\/(.+)$/);
  if (chatMatch) {
    const id = chatMatch[1]!;
    const chat = await deps.storage.getChat(id);
    if (!chat) return { status: 404, body: { error: "chat not found" } };
    if (req.method === "GET") {
      const settings = await deps.storage.getChatSettings(id);
      return { status: 200, body: { chat, settings: settings ?? {} } };
    }
    if (req.method === "PUT") {
      const next = normalizeChatSettings(req.body);
      await deps.storage.saveChatSettings(id, next);
      return { status: 200, body: { chat, settings: next } };
    }
  }

  return { status: 404, body: { error: "not found" } };
}
