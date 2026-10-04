// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { m } from "./message";

// Who may talk to the bot: the whitelist and the blacklist.
export const accessMessages = {
  ui_access_header: m({
    en: "Access",
    ru: "Доступ",
  }),
  ui_access_allowed: m({
    en: "Allowed",
    ru: "Разрешено",
  }),
  ui_access_blocked: m({
    en: "Blocked",
    ru: "Заблокировано",
  }),
  ui_access_footer_user: m({
    en: "Blocked users are always denied; their pending reminders are dropped.",
    ru: "Заблокированным всегда отказ; их отложенные напоминания не доставляются.",
  }),
  ui_access_footer_chat: m({
    en: "A blocked chat is denied for everyone except you; pending reminders are dropped.",
    ru: "Заблокированному чату отказ для всех, кроме вас; отложенные напоминания не доставляются.",
  }),
  ui_whitelist_enforce: m({
    en: "Enforce Whitelist",
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
    en: "None",
    ru: "Нет",
  }),
  ui_whitelist_footer: m({
    en: "Swipe left to remove an entry. To add one, open the user or chat.",
    ru: "Смахните влево, чтобы убрать запись. Чтобы добавить, откройте пользователя или чат.",
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
