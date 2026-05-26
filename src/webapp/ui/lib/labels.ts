// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { Strings } from "./routes";
import { composeFullName, type Chat, type User } from "../../../shared/types";
import type { Reminder } from "../../../reminders/types";
import type { Lang } from "../../../shared/i18n";
import type { DisplayNameError } from "../../../shared/display-name";

// USD spend can range from fractions of a cent per request to dollars over a
// month, so allow up to 4 decimals while always showing at least 2.
export function formatUsd(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
}

export function chatTitle(s: Strings, c: Chat): string {
  if (c.title && c.title.length > 0) return c.title;
  if (c.username) return `@${c.username}`;
  if (c.type === "private") return s.ui_chat_private;
  return `id:${c.id}`;
}

export function chatSubtitle(c: Chat): string {
  return c.username && c.title ? `${c.type} · @${c.username}` : c.type;
}

export function userDisplayName(u: User, displayName?: string | null): string {
  if (displayName && displayName.length > 0) return displayName;
  return composeFullName(u.firstName, u.lastName) || `id:${u.id}`;
}

export function reminderTargetLabel(
  s: Strings,
  r: Reminder,
  chats: Record<string, Chat>,
): string {
  if (r.target.kind === "guest_dm") return s.ui_reminders_dm;
  const chat = chats[r.target.chatId];
  if (chat) return chatTitle(s, chat);
  return s.ui_reminders_chat_fallback(r.target.chatId);
}

export function reminderUserLabel(
  r: Reminder,
  users: Record<string, User> | undefined,
  displayNames?: Record<string, string | null>,
): { primary: string; secondary: string | null } {
  const u = users?.[r.userId];
  if (!u) return { primary: `id ${r.userId}`, secondary: null };
  return {
    primary: userDisplayName(u, displayNames?.[r.userId]),
    secondary: u.username ? `@${u.username}` : `id ${u.id}`,
  };
}

export const LANG_LABEL_KEY = {
  en: "ui_main_lang_english",
  ru: "ui_main_lang_russian",
} as const satisfies Record<Lang, keyof Strings>;

export const DISPLAY_NAME_ERR_KEY = {
  too_long: "ui_main_name_err_too_long",
  multiline: "ui_main_name_err_multiline",
  control_char: "ui_main_name_err_control_char",
  charset: "ui_main_name_err_charset",
  blocked_token: "ui_main_name_err_blocked_token",
  no_letter: "ui_main_name_err_no_letter",
} as const satisfies Record<DisplayNameError, keyof Strings>;
