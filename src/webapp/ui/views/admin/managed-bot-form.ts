// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { ManagedBot } from "../../../../managed-bots/types";
import type { ManagedBotInput } from "../../../../managed-bots/validate";

export type BotForm = ManagedBotInput;

export function botForm(bot: ManagedBot): BotForm {
  return { displayName: bot.displayName, systemPrompt: bot.systemPrompt };
}

// Takes back the fields a refused save changed, but only those still showing
// the refused text: a field typed into since keeps what was typed.
export function revertFailed(
  form: BotForm,
  failed: BotForm,
  confirmed: BotForm,
): BotForm {
  const revert = (key: keyof BotForm) =>
    failed[key] !== confirmed[key] && form[key] === failed[key]
      ? confirmed[key]
      : form[key];
  return {
    displayName: revert("displayName"),
    systemPrompt: revert("systemPrompt"),
  };
}

// Telegram's "create a bot for this manager" deep link, with the owner's
// suggested username and name filled in when they typed any.
export function newBotLink(
  manager: string,
  username: string,
  name: string,
): string {
  let link = `https://t.me/newbot/${manager}`;
  if (username.trim()) link += `/${username.trim()}`;
  if (name.trim()) link += `?name=${encodeURIComponent(name.trim())}`;
  return link;
}
