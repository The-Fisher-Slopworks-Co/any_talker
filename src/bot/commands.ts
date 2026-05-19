// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { BotCommand } from "grammy/types";

export type SyncCommandsApi = {
  setMyCommands(
    commands: readonly BotCommand[],
    other?: { language_code?: string },
  ): Promise<unknown>;
};

export const BOT_COMMANDS_EN: readonly BotCommand[] = [
  { command: "ask", description: "Ask (short answer)" },
  { command: "askmore", description: "Ask (detailed answer)" },
  { command: "askwise", description: "Ask wise man (exhaustive answer)" },
];

export const BOT_COMMANDS_RU: readonly BotCommand[] = [
  { command: "ask", description: "Спросить (коротко)" },
  { command: "askmore", description: "Спросить (подробно)" },
  { command: "askwise", description: "Спросить мудреца (исчерпывающе)" },
];

export async function syncBotCommands(api: SyncCommandsApi): Promise<void> {
  await api.setMyCommands(BOT_COMMANDS_EN);
  await api.setMyCommands(BOT_COMMANDS_RU, { language_code: "ru" });
}
