// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { Chat, ChatSettings } from "../../../shared/types";
import { req } from "./http";

export type ChatSettingsResponse = {
  chat: Chat;
  settings: ChatSettings;
  whitelisted: boolean;
  blacklisted: boolean;
};

// `webapp/routes/admin-chats.ts`
export const adminChatsApi = {
  listAdminChats: () => req<{ chats: Chat[] }>("GET", "/api/admin/chats"),
  getAdminChat: (id: string) =>
    req<ChatSettingsResponse>("GET", `/api/admin/chats/${id}`),
  putAdminChat: (id: string, settings: ChatSettings) =>
    req<{ chat: Chat; settings: ChatSettings }>(
      "PUT",
      `/api/admin/chats/${id}`,
      settings,
    ),
};
