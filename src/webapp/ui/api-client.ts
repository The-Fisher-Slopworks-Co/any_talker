/// <reference lib="dom" />
import type { Settings, WhitelistEntry, BucketState, User } from "../../shared/types";

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData: string;
        initDataUnsafe?: {
          user?: { first_name?: string; last_name?: string; username?: string };
        };
        ready: () => void;
        expand: () => void;
        openTelegramLink?: (url: string) => void;
        openLink?: (url: string) => void;
        BackButton?: {
          show: () => void;
          hide: () => void;
          onClick: (cb: () => void) => void;
          offClick: (cb: () => void) => void;
        };
      };
    };
  }
}

export type MeResponse = { isOwner: boolean; displayName: string | null };
export type UserSettingsResponse = { user: User; displayName: string | null };

function authHeader(): Record<string, string> {
  const initData = window.Telegram?.WebApp?.initData ?? "";
  return { Authorization: `tma ${initData}` };
}

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: { ...authHeader(), "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status}`);
  return (await res.json()) as T;
}

export const api = {
  getSettings: () => req<Settings>("GET", "/api/settings"),
  putSettings: (patch: Partial<Settings>) => req<Settings>("PUT", "/api/settings", patch),
  getWhitelist: () =>
    req<{ users: WhitelistEntry[]; chats: WhitelistEntry[] }>("GET", "/api/whitelist"),
  addWhitelist: (kind: "users" | "chats", entry: WhitelistEntry) =>
    req<WhitelistEntry[]>("POST", `/api/whitelist/${kind}`, entry),
  removeWhitelist: (kind: "users" | "chats", id: string) =>
    req<WhitelistEntry[]>("DELETE", `/api/whitelist/${kind}/${id}`),
  getMyBucket: () => req<{ bucket: BucketState | null }>("GET", "/api/ratelimit/me"),
  resetMyBucket: () =>
    req<{ bucket: BucketState | null }>("PUT", "/api/ratelimit/me", { reset: true }),
  getMe: () => req<MeResponse>("GET", "/api/me"),
  putMe: (displayName: string | null) =>
    req<MeResponse>("PUT", "/api/me", { displayName }),
  listAdminUsers: () => req<{ users: User[] }>("GET", "/api/admin/users"),
  getAdminUser: (id: string) =>
    req<UserSettingsResponse>("GET", `/api/admin/users/${id}`),
  putAdminUser: (id: string, displayName: string | null) =>
    req<UserSettingsResponse>("PUT", `/api/admin/users/${id}`, { displayName }),
};
