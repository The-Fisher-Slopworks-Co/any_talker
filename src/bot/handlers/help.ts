// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { InlineKeyboardMarkup } from "grammy/types";
import { t, type Lang } from "../../shared/i18n";

// `/help`, and `/start` as its alias: the first thing a new user sends gets the
// same home page. A trailing argument is tolerated because `/start` carries a
// deep-link payload, which the guide has no use for.
const COMMAND_RE = /^\/(?:help|start)(?:@(\w+))?(?:\s[\s\S]*)?$/i;

// Addressed to this bot: bare, or `@`-suffixed with its own username, as
// `/usage` matches its. The guide reads the same from every family bot, so the
// command is shared and `explicit` feeds the who-answers gate.
export function matchHelpCommand(
  text: string,
  selfUsername: string | undefined,
): { explicit: boolean } | null {
  const m = COMMAND_RE.exec(text.trim());
  if (!m) return null;
  const addressed = m[1];
  if (
    addressed !== undefined &&
    addressed.toLowerCase() !== selfUsername?.toLowerCase()
  ) {
    return null;
  }
  return { explicit: addressed !== undefined };
}

export const HELP_SECTIONS = [
  "dialog",
  "features",
  "reminders",
  "groups",
] as const;

export type HelpPageId = "home" | (typeof HELP_SECTIONS)[number];

export const HELP_CALLBACK_RE =
  /^help:(home|dialog|features|reminders|groups)$/;

const callback = (page: HelpPageId) => `help:${page}`;

export type HelpPage = { text: string; replyMarkup: InlineKeyboardMarkup };

// One page of the guide: the home page links every section two to a row, and a
// section links back home. Pure, so the dispatcher only decides how to deliver.
export function helpPage(lang: Lang, page: HelpPageId): HelpPage {
  const s = t(lang);
  if (page !== "home") {
    const text = {
      dialog: s.bot_help_dialog,
      features: s.bot_help_features,
      reminders: s.bot_help_reminders,
      groups: s.bot_help_groups,
    }[page];
    return {
      text,
      replyMarkup: {
        inline_keyboard: [
          [{ text: s.bot_help_btn_back, callback_data: callback("home") }],
        ],
      },
    };
  }
  const label = {
    dialog: s.bot_help_btn_dialog,
    features: s.bot_help_btn_features,
    reminders: s.bot_help_btn_reminders,
    groups: s.bot_help_btn_groups,
  };
  const buttons = HELP_SECTIONS.map((id) => ({
    text: label[id],
    callback_data: callback(id),
  }));
  const rows = [];
  for (let i = 0; i < buttons.length; i += 2)
    rows.push(buttons.slice(i, i + 2));
  return { text: s.bot_help_home, replyMarkup: { inline_keyboard: rows } };
}
