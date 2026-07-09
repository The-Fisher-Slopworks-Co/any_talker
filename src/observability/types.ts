// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { Api } from "grammy";

// Narrow owner-DM sender — the only capability the observability scheduler needs
// from Telegram. Kept small (not grammY's full Api) so the test double stays
// tiny, mirroring `ReminderApi`.
export type NotifyApi = {
  sendMessage(chatId: string | number, text: string): Promise<unknown>;
};

export function notifyApiFromGrammy(api: Api): NotifyApi {
  return { sendMessage: (chatId, text) => api.sendMessage(chatId, text) };
}
