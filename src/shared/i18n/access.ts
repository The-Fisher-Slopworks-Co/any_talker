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
    en: "When on, only whitelisted users/chats (and you) may use the bot. When off, anyone may — the USD budget caps and rate limit are the only protection. Entries below are kept either way.",
    ru: "Когда включено, ботом могут пользоваться только пользователи/чаты из белого списка (и вы). Когда выключено — кто угодно, и защищают только лимиты трат в долларах и рейт-лимит. Записи ниже сохраняются в любом случае.",
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
  ui_whitelist_footer_users: m({
    en: 'Add entries from a user\'s page via "Add to whitelist".',
    ru: "Добавляйте записи со страницы пользователя через «Добавить в белый список».",
  }),
  ui_whitelist_footer_chats: m({
    en: 'Add entries from a chat\'s page via "Add to whitelist".',
    ru: "Добавляйте записи со страницы чата через «Добавить в белый список».",
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
    en: 'Blocked users are always denied — even when the whitelist is off, and even in whitelisted chats. Their pending reminders are dropped. Add entries from a user\'s page via "Add to blacklist".',
    ru: "Заблокированным пользователям бот отказывает всегда — даже при выключенном белом списке и даже в разрешённых чатах. Их отложенные напоминания не доставляются. Добавляйте записи со страницы пользователя через «Добавить в чёрный список».",
  }),
  ui_blacklist_footer_chats: m({
    en: 'In a blocked chat everyone is denied (except you) — even when the whitelist is off, and even if the chat is whitelisted. Its pending reminders are dropped. Add entries from a chat\'s page via "Add to blacklist".',
    ru: "В заблокированном чате бот отказывает всем, кроме вас — даже при выключенном белом списке и даже если чат в белом списке. Отложенные напоминания этого чата не доставляются. Добавляйте записи со страницы чата через «Добавить в чёрный список».",
  }),
};
