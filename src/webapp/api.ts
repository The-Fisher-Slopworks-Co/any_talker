import type { Storage } from "../storage/types";
import type { RateLimiter } from "../ratelimit/types";
import type { Settings, WhitelistEntry } from "../shared/types";
import { getOrInitSettings } from "../settings";

export type ApiRequest = {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  body: unknown;
};

export type ApiResponse = { status: number; body: unknown };

export type ApiDeps = {
  storage: Storage;
  rateLimiter: RateLimiter;
  ownerId: string;
};

export async function handleApi(req: ApiRequest, deps: ApiDeps): Promise<ApiResponse> {
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

  if (req.path === "/api/ratelimit/me") {
    if (req.method === "GET") {
      const bucket = await deps.storage.getBucket(deps.ownerId);
      return { status: 200, body: { bucket } };
    }
    if (req.method === "PUT") {
      const settings = await getOrInitSettings(deps.storage);
      const body = (req.body ?? {}) as { reset?: boolean };
      if (body.reset) {
        await deps.rateLimiter.reset(deps.ownerId, settings.rateLimit, Date.now());
      }
      const bucket = await deps.storage.getBucket(deps.ownerId);
      return { status: 200, body: { bucket } };
    }
  }

  return { status: 404, body: { error: "not found" } };
}
