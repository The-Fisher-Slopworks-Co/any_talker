// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { Api } from "grammy";

// Narrow owner-DM sender — the only capability the observability scheduler needs
// from Telegram. Kept small (not grammY's full Api) so the test double stays
// tiny, mirroring `ReminderApi`.
export type NotifyApi = {
  sendMessage(chatId: string | number, text: string): Promise<unknown>;
  // The digest carries Rich Markdown tables (Bot API 10.1); spike alerts are
  // one plain sentence and keep using `sendMessage`.
  sendRichMessage(params: {
    chat_id: string | number;
    rich_message: { markdown: string };
  }): Promise<unknown>;
};

// Adapt a grammY Api into NotifyApi.
export function notifyApiFromGrammy(api: Api): NotifyApi {
  return {
    sendMessage: (chatId, text) => api.sendMessage(chatId, text),
    sendRichMessage: ({ chat_id, rich_message }) =>
      api.sendRichMessage(chat_id, rich_message),
  };
}
