// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

/// <reference lib="dom" />
import type {
  Settings,
  WhitelistEntry,
  WhitelistKind,
  User,
  Chat,
  ChatSettings,
  Gender,
} from "../../shared/types";
import type { Lang } from "../../shared/i18n";
import type { Reminder } from "../../reminders/types";
import type { RecurringCheck } from "../../checks/types";
import type { CheckInputFields } from "../../checks/validate";
import type { ManagedBot } from "../../managed-bots/types";
import type { ManagedBotInput } from "../../managed-bots/validate";
import type { SpendSummary } from "../../spending/window";
import type { SpendOverview } from "../../spending/overview";
import type { UsageStatus } from "../../ratelimit/window";

export type { SpendSummary, UsageStatus, SpendOverview };

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
export type BuildInfoResponse = {
  commit: string | null;
  shortCommit: string | null;
};
export type UserSettingsResponse = {
  user: User;
  displayName: string | null;
  timezone: string | null;
  gender: Gender | null;
  language: Lang | null;
  whitelisted: boolean;
};
export type ChatSettingsResponse = {
  chat: Chat;
  settings: ChatSettings;
  whitelisted: boolean;
};
export type SpendingResponse = {
  spending: SpendSummary;
};
export type UserFact = { key: string; value: string };
export type FactBot = {
  botId: string | null;
  displayName: string | null;
  username: string | null;
};
export type FactsResponse = { facts: UserFact[]; cap: number };
export type ManagedBotRow = ManagedBot & { running: boolean };
export type ManagedBotDetail = { bot: ManagedBot; running: boolean };
export type ManagedBotNewInfo = {
  username: string | null;
  canManageBots: boolean;
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
  getMyUsage: () => req<{ usage: UsageStatus }>("GET", "/api/ratelimit/me"),
  resetMyUsage: () =>
    req<{ usage: UsageStatus }>("PUT", "/api/ratelimit/me", { reset: true }),
  getUserUsage: (id: string) =>
    req<{ usage: UsageStatus }>("GET", `/api/ratelimit/user/${id}`),
  resetUserUsage: (id: string) =>
    req<{ usage: UsageStatus }>("PUT", `/api/ratelimit/user/${id}`, {
      reset: true,
    }),
  getMySpending: () => req<SpendingResponse>("GET", "/api/me/spending"),
  getUserSpending: (id: string) =>
    req<SpendingResponse>("GET", `/api/admin/users/${id}/spending`),
  getMe: () => req<MeResponse>("GET", "/api/me"),
  putMe: (patch: {
    displayName?: string | null;
    timezone?: string | null;
    gender?: Gender | null;
    language?: Lang | null;
  }) => req<MeResponse>("PUT", "/api/me", patch),
  listAdminUsers: () =>
    req<{
      users: User[];
      displayNames: Record<string, string | null>;
      spending: Record<string, SpendSummary>;
    }>("GET", "/api/admin/users"),
  getAdminUser: (id: string) =>
    req<UserSettingsResponse>("GET", `/api/admin/users/${id}`),
  putAdminUser: (
    id: string,
    patch: {
      displayName?: string | null;
      timezone?: string | null;
      gender?: Gender | null;
      language?: Lang | null;
    },
  ) =>
    req<{
      user: User;
      displayName: string | null;
      timezone: string | null;
      gender: Gender | null;
      language: Lang | null;
    }>("PUT", `/api/admin/users/${id}`, patch),
  listAdminChats: () => req<{ chats: Chat[] }>("GET", "/api/admin/chats"),
  getSpendOverview: () =>
    req<SpendOverview>("GET", "/api/admin/spend/overview"),
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
  listMyBots: () => req<{ bots: FactBot[] }>("GET", "/api/me/bots"),
  listMyFacts: (scope: string) =>
    req<FactsResponse>("GET", `/api/me/facts/${scope}`),
  addMyFact: (scope: string, fact: UserFact) =>
    req<FactsResponse>("POST", `/api/me/facts/${scope}`, fact),
  updateMyFact: (scope: string, key: string, patch: { value: string; newKey?: string }) =>
    req<FactsResponse>("PUT", `/api/me/facts/${scope}/${key}`, patch),
  deleteMyFact: (scope: string, key: string) =>
    req<FactsResponse>("DELETE", `/api/me/facts/${scope}/${key}`),
  listUserFacts: (id: string, scope: string) =>
    req<FactsResponse>("GET", `/api/admin/users/${id}/facts/${scope}`),
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
  listManagedBots: () =>
    req<{ bots: ManagedBotRow[] }>("GET", "/api/admin/managed-bots"),
  getManagedBotNewInfo: () =>
    req<ManagedBotNewInfo>("GET", "/api/admin/managed-bots/new"),
  getManagedBot: (id: string) =>
    req<ManagedBotDetail>("GET", `/api/admin/managed-bots/${id}`),
  updateManagedBot: (id: string, input: ManagedBotInput) =>
    req<ManagedBotDetail>("PUT", `/api/admin/managed-bots/${id}`, input),
  deleteManagedBot: (id: string) =>
    req<{ ok: true }>("DELETE", `/api/admin/managed-bots/${id}`),
  setManagedBotAvatar: (id: string, photoBase64: string) =>
    req<{ ok: true }>("PUT", `/api/admin/managed-bots/${id}/avatar`, {
      photoBase64,
    }),
  getBuildInfo: async (): Promise<BuildInfoResponse> => {
    const res = await fetch("/api/build-info", { method: "GET" });
    if (!res.ok) return { commit: null, shortCommit: null };
    return (await res.json()) as BuildInfoResponse;
  },
};

export type RemindersResponse = {
  reminders: Reminder[];
  chats: Record<string, Chat>;
  users?: Record<string, User>;
  displayNames?: Record<string, string | null>;
};
