/// <reference lib="dom" />
import type {
  Settings,
  WhitelistEntry,
  WhitelistKind,
  BucketState,
  User,
  Chat,
  ChatSettings,
  Gender,
} from "../../shared/types";
import type { Lang } from "../../shared/i18n";
import type { Reminder } from "../../reminders/types";
import type { RecurringCheck } from "../../checks/types";
import type { CheckInputFields } from "../../checks/validate";

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData: string;
        initDataUnsafe?: {
          user?: {
            first_name?: string;
            last_name?: string;
            username?: string;
            language_code?: string;
          };
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

export type MeResponse = {
  isOwner: boolean;
  displayName: string | null;
  timezone: string | null;
  gender: Gender | null;
  language: Lang | null;
};
export type UserSettingsResponse = {
  user: User;
  displayName: string | null;
  whitelisted: boolean;
};
export type ChatSettingsResponse = {
  chat: Chat;
  settings: ChatSettings;
  whitelisted: boolean;
};

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
  if (!res.ok) {
    let errorCode: string | null = null;
    try {
      const data = (await res.json()) as { error?: unknown };
      if (typeof data.error === "string") errorCode = data.error;
    } catch {
      // ignore
    }
    const err = new Error(
      errorCode
        ? `${method} ${path}: ${res.status} ${errorCode}`
        : `${method} ${path}: ${res.status}`,
    ) as Error & { code: string | null; status: number };
    err.code = errorCode;
    err.status = res.status;
    throw err;
  }
  return (await res.json()) as T;
}

export const api = {
  getSettings: () => req<Settings>("GET", "/api/settings"),
  putSettings: (patch: Partial<Settings>) => req<Settings>("PUT", "/api/settings", patch),
  getWhitelist: () =>
    req<{ users: WhitelistEntry[]; chats: WhitelistEntry[] }>("GET", "/api/whitelist"),
  addWhitelist: (kind: WhitelistKind, entry: WhitelistEntry) =>
    req<WhitelistEntry[]>("POST", `/api/whitelist/${kind}`, entry),
  removeWhitelist: (kind: WhitelistKind, id: string) =>
    req<WhitelistEntry[]>("DELETE", `/api/whitelist/${kind}/${id}`),
  getMyBucket: () => req<{ bucket: BucketState | null }>("GET", "/api/ratelimit/me"),
  resetMyBucket: () =>
    req<{ bucket: BucketState | null }>("PUT", "/api/ratelimit/me", { reset: true }),
  getMe: () => req<MeResponse>("GET", "/api/me"),
  putMe: (patch: {
    displayName?: string | null;
    timezone?: string | null;
    gender?: Gender | null;
    language?: Lang | null;
  }) => req<MeResponse>("PUT", "/api/me", patch),
  listAdminUsers: () => req<{ users: User[] }>("GET", "/api/admin/users"),
  getAdminUser: (id: string) =>
    req<UserSettingsResponse>("GET", `/api/admin/users/${id}`),
  putAdminUser: (id: string, displayName: string | null) =>
    req<{ user: User; displayName: string | null }>(
      "PUT",
      `/api/admin/users/${id}`,
      { displayName },
    ),
  listAdminChats: () => req<{ chats: Chat[] }>("GET", "/api/admin/chats"),
  getAdminChat: (id: string) =>
    req<ChatSettingsResponse>("GET", `/api/admin/chats/${id}`),
  putAdminChat: (id: string, settings: ChatSettings) =>
    req<{ chat: Chat; settings: ChatSettings }>(
      "PUT",
      `/api/admin/chats/${id}`,
      settings,
    ),
  listMyReminders: () =>
    req<RemindersResponse>("GET", "/api/me/reminders"),
  listAdminReminders: () =>
    req<RemindersResponse>("GET", "/api/admin/reminders"),
  listChecks: () =>
    req<{ checks: RecurringCheck[] }>("GET", "/api/admin/checks"),
  getCheck: (id: string) =>
    req<{ check: RecurringCheck }>("GET", `/api/admin/checks/${id}`),
  createCheck: (input: CheckInputFields) =>
    req<{ check: RecurringCheck }>("POST", "/api/admin/checks", input),
  updateCheck: (id: string, input: CheckInputFields) =>
    req<{ check: RecurringCheck }>("PUT", `/api/admin/checks/${id}`, input),
  deleteCheck: (id: string) =>
    req<{ ok: true }>("DELETE", `/api/admin/checks/${id}`),
};

export type RemindersResponse = {
  reminders: Reminder[];
  chats: Record<string, Chat>;
  users?: Record<string, User>;
};
