// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { BotCommand, BotCommandScope } from "grammy/types";

export type SyncCommandsApi = {
  setMyCommands(
    commands: readonly BotCommand[],
    other?: { language_code?: string; scope?: BotCommandScope },
  ): Promise<unknown>;
};

export const BOT_COMMANDS_EN: readonly BotCommand[] = [
  { command: "ask", description: "Ask (short answer)" },
  { command: "askwise", description: "Ask (detailed answer)" },
];

export const BOT_COMMANDS_RU: readonly BotCommand[] = [
  { command: "ask", description: "Спросить (коротко)" },
  { command: "askwise", description: "Спросить (подробно)" },
];

export const BOT_COMMAND_SCOPES: readonly BotCommandScope[] = [
  { type: "all_private_chats" },
  { type: "all_group_chats" },
  { type: "all_chat_administrators" },
];

export async function syncBotCommands(api: SyncCommandsApi): Promise<void> {
  await api.setMyCommands(BOT_COMMANDS_EN);
  await api.setMyCommands(BOT_COMMANDS_EN, { language_code: "en" });
  await api.setMyCommands(BOT_COMMANDS_RU, { language_code: "ru" });
  for (const scope of BOT_COMMAND_SCOPES) {
    await api.setMyCommands(BOT_COMMANDS_EN, { scope });
    await api.setMyCommands(BOT_COMMANDS_EN, { scope, language_code: "en" });
    await api.setMyCommands(BOT_COMMANDS_RU, { scope, language_code: "ru" });
  }
}
