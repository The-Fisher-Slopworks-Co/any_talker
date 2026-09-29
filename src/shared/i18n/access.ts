// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { m } from "./message";

// Who may talk to the bot: the whitelist and the blacklist.
export const accessMessages = {
  ui_whitelist_remove: m({
    en: "Remove from whitelist",
    ru: "Убрать из белого списка",
  }),
  ui_whitelist_add: m({
    en: "Add to whitelist",
    ru: "Добавить в белый список",
  }),
  ui_whitelist_enforce: m({
    en: "Enforce whitelist",
    ru: "Требовать белый список",
  }),
  ui_whitelist_enforce_footer: m({
    en: "Off: anyone can use the bot. Entries are kept.",
    ru: "Выкл.: бот доступен всем. Записи сохраняются.",
  }),
  ui_whitelist_allowed_users: m({
    en: "Allowed Users",
    ru: "Разрешённые пользователи",
  }),
  ui_whitelist_allowed_chats: m({
    en: "Allowed Chats",
    ru: "Разрешённые чаты",
  }),
  ui_whitelist_no_entries: m({
    en: "No entries",
    ru: "Записей нет",
  }),
  ui_blacklist_add: m({
    en: "Add to blacklist",
    ru: "Добавить в чёрный список",
  }),
  ui_blacklist_remove: m({
    en: "Remove from blacklist",
    ru: "Убрать из чёрного списка",
  }),
  ui_blacklist_blocked_users: m({
    en: "Blocked Users",
    ru: "Заблокированные пользователи",
  }),
  ui_blacklist_blocked_chats: m({
    en: "Blocked Chats",
    ru: "Заблокированные чаты",
  }),
  ui_blacklist_footer_users: m({
    en: "Always denied. Pending reminders are dropped.",
    ru: "Всегда отказ. Отложенные напоминания не доставляются.",
  }),
  ui_blacklist_footer_chats: m({
    en: "Denied for everyone except you. Pending reminders are dropped.",
    ru: "Отказ всем, кроме вас. Отложенные напоминания не доставляются.",
  }),
};
