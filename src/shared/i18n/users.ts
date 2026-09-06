// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { m } from "./message";

// Users: the admin list and a single user's profile.
export const usersMessages = {
  ui_users_all: m({
    en: "All Users",
    ru: "Все пользователи",
  }),
  ui_users_empty: m({
    en: "No users yet — they appear after their first message.",
    ru: "Пользователей пока нет — они появятся после первого сообщения.",
  }),
  ui_users_footer: m({
    en: "Users are recorded automatically the first time they message the bot.",
    ru: "Пользователи записываются автоматически при первом сообщении боту.",
  }),
  ui_user_not_found: m({
    en: "User not found.",
    ru: "Пользователь не найден.",
  }),
  ui_user_profile: m({
    en: "Profile",
    ru: "Профиль",
  }),
  ui_user_name: m({
    en: "Name",
    ru: "Имя",
  }),
  ui_user_username: m({
    en: "Username",
    ru: "Username",
  }),
  ui_user_id: m({
    en: "ID",
    ru: "ID",
  }),
  ui_user_last_seen: m({
    en: "Last seen",
    ru: "Последний раз",
  }),
  ui_user_open_in_tg: m({
    en: "Open in Telegram",
    ru: "Открыть в Telegram",
  }),
  ui_user_display_name_footer: m({
    en: "Override the name shown to the AI for this user.",
    ru: "Переопределить имя, которое видит ИИ для этого пользователя.",
  }),
  ui_user_set_language: m({
    en: "Set language",
    ru: "Задать язык",
  }),
  ui_user_usage: m({
    en: "Rate Limit Usage",
    ru: "Использование лимита",
  }),
};
