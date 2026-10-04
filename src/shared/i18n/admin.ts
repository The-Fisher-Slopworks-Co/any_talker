// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { m } from "./message";
import { pluralRu } from "./plural";

// Admin panel chrome: the section titles and the home screen's groups.
export const adminMessages = {
  ui_admin_prompt: m({
    en: "Prompt",
    ru: "Промпт",
  }),
  ui_admin_limits: m({
    en: "Limits",
    ru: "Лимиты",
  }),
  ui_admin_budget: m({
    en: "Budget Caps",
    ru: "Лимиты бюджета",
  }),
  ui_admin_spend: m({
    en: "Spending",
    ru: "Траты",
  }),
  ui_admin_whitelist: m({
    en: "Whitelist",
    ru: "Белый список",
  }),
  ui_admin_users: m({
    en: "Users",
    ru: "Пользователи",
  }),
  ui_admin_chats: m({
    en: "Chats",
    ru: "Чаты",
  }),
  ui_admin_reminders: m({
    en: "Reminders",
    ru: "Напоминания",
  }),
  ui_admin_quarantine: m({
    en: "Quarantine",
    ru: "Карантин",
  }),
  ui_admin_checks: m({
    en: "Checks",
    ru: "Чеки",
  }),
  ui_admin_group_spending: m({
    en: "Spending & Limits",
    ru: "Траты и лимиты",
  }),
  ui_admin_group_access: m({
    en: "Access",
    ru: "Доступ",
  }),
  ui_admin_group_automation: m({
    en: "Automation",
    ru: "Автоматизация",
  }),

  // Values beside the home's rows.
  ui_admin_value_on: m({
    en: "On",
    ru: "Вкл.",
  }),
  ui_admin_value_off: m({
    en: "Off",
    ru: "Выкл.",
  }),
  ui_admin_value_not_created: m({
    en: "Not Created",
    ru: "Не создан",
  }),
  ui_admin_value_created: m({
    en: "Created",
    ru: "Создан",
  }),

  // Spoken for the red count on the Feedback row.
  ui_admin_new_count: m({
    en: (n: number) => `${n} new`,
    ru: (n: number) => pluralRu(n, "новый", "новых", "новых"),
  }),

  // The admin API token: a bearer that opens the admin API without Telegram.
  ui_admin_api_token: m({
    en: "API Token",
    ru: "API-токен",
  }),
  ui_api_token_status: m({
    en: "Token",
    ru: "Токен",
  }),
  ui_api_token_none: m({
    en: "Not created",
    ru: "Не создан",
  }),
  ui_api_token_created: m({
    en: (at: string) => `Created ${at}`,
    ru: (at: string) => `Создан ${at}`,
  }),
  ui_api_token_create: m({
    en: "Create token",
    ru: "Создать токен",
  }),
  ui_api_token_recreate: m({
    en: "Create a new token",
    ru: "Создать новый токен",
  }),
  ui_api_token_recreate_confirm: m({
    en: "The current token will stop working. Create a new one?",
    ru: "Текущий токен перестанет работать. Создать новый?",
  }),
  ui_api_token_delete: m({
    en: "Delete token",
    ru: "Удалить токен",
  }),
  ui_api_token_delete_confirm: m({
    en: "Delete the token? Its users lose access.",
    ru: "Удалить токен? Доступ пропадёт.",
  }),
  ui_api_token_footer: m({
    en: "Send as Authorization: Bearer <token>. Full admin API access.",
    ru: "Передавай в Authorization: Bearer <токен>. Полный доступ к админскому API.",
  }),
  ui_api_token_new_header: m({
    en: "New token",
    ru: "Новый токен",
  }),
  ui_api_token_new_footer: m({
    en: "Shown once. Copy it now.",
    ru: "Показывается один раз. Скопируй сейчас.",
  }),
  ui_api_token_copy: m({
    en: "Copy",
    ru: "Скопировать",
  }),
  ui_api_token_copied: m({
    en: "Copied",
    ru: "Скопировано",
  }),
  ui_api_token_error: m({
    en: "Something went wrong. Try again.",
    ru: "Что-то пошло не так. Попробуй ещё раз.",
  }),
};
