// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { ManagedBot } from "../../../managed-bots/types";
import type { ManagedBotInput } from "../../../managed-bots/validate";
import { req } from "./http";

export type ManagedBotRow = ManagedBot & { running: boolean };
export type ManagedBotDetail = { bot: ManagedBot; running: boolean };
export type ManagedBotNewInfo = {
  username: string | null;
  canManageBots: boolean;
};

// `webapp/routes/admin-managed-bots.ts`
export const adminManagedBotsApi = {
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
};
