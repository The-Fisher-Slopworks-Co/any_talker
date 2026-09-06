// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { m } from "./message";

// Admin panel chrome: the tab titles and their descriptions.
export const adminMessages = {
  ui_admin_prompt: m({
    en: "Prompt",
    ru: "Промпт",
  }),
  ui_admin_prompt_desc: m({
    en: "Models, character, timezone, collapse threshold",
    ru: "Модели, персонаж, часовой пояс, порог сворачивания",
  }),
  ui_admin_limits: m({
    en: "Limits",
    ru: "Лимиты",
  }),
  ui_admin_limits_desc: m({
    en: "5-hour and weekly token budgets",
    ru: "Бюджеты токенов за 5 часов и за неделю",
  }),
  ui_admin_budget: m({
    en: "Budget caps",
    ru: "Лимиты бюджета",
  }),
  ui_admin_budget_desc: m({
    en: "USD spend caps and anomaly thresholds",
    ru: "Потолки трат в USD и пороги аномалий",
  }),
  ui_admin_spend: m({
    en: "Spend dashboard",
    ru: "Дашборд трат",
  }),
  ui_admin_spend_desc: m({
    en: "Totals, top spenders, models, denials",
    ru: "Итоги, топ-спендеры, модели, отказы",
  }),
  ui_admin_whitelist: m({
    en: "Whitelist",
    ru: "Белый список",
  }),
  ui_admin_whitelist_desc: m({
    en: "Allowed users and chats",
    ru: "Разрешённые пользователи и чаты",
  }),
  ui_admin_users: m({
    en: "Users",
    ru: "Пользователи",
  }),
  ui_admin_users_desc: m({
    en: "All users the bot has seen",
    ru: "Все пользователи, которых видел бот",
  }),
  ui_admin_chats: m({
    en: "Chats",
    ru: "Чаты",
  }),
  ui_admin_chats_desc: m({
    en: "All chats and per-chat overrides",
    ru: "Все чаты и их переопределения",
  }),
  ui_admin_reminders: m({
    en: "Reminders",
    ru: "Напоминания",
  }),
  ui_admin_reminders_desc: m({
    en: "Pending reminders for everyone",
    ru: "Ожидающие напоминания всех пользователей",
  }),
  ui_admin_checks: m({
    en: "Checks",
    ru: "Чеки",
  }),
  ui_admin_checks_desc: m({
    en: "Recurring daily questions with Yes/No buttons",
    ru: "Циклические вопросы с кнопками Да/Нет",
  }),
};
