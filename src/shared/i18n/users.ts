// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { m } from "./message";

// Users: the admin list and a single user's profile.
export const usersMessages = {
  ui_users_all: m({
    en: "All Users · Last 30 Days",
    ru: "Все пользователи · 30 дней",
  }),
  ui_users_empty: m({
    en: "No users yet.",
    ru: "Пользователей пока нет.",
  }),
  ui_user_not_found: m({
    en: "User not found.",
    ru: "Пользователь не найден.",
  }),
  ui_user_name: m({
    en: "Name",
    ru: "Имя",
  }),
  ui_user_id: m({
    en: "ID",
    ru: "ID",
  }),
  ui_user_last_seen: m({
    en: "Last Seen",
    ru: "Последний раз",
  }),
  ui_user_open_in_tg: m({
    en: "Open in Telegram",
    ru: "Открыть в Telegram",
  }),
  ui_user_about: m({
    en: "About",
    ru: "О пользователе",
  }),
  ui_user_about_footer: m({
    en: (fallback: string) =>
      `What the AI calls the user (empty: ${fallback}).`,
    ru: (fallback: string) =>
      `Как ИИ называет пользователя (пусто: ${fallback}).`,
  }),
  ui_user_set_language: m({
    en: "Set language",
    ru: "Задать язык",
  }),
};
