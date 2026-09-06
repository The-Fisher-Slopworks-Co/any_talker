// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { m } from "./message";

// Reminders: the user's own list and the admin overview.
export const remindersMessages = {
  ui_reminders_upcoming: m({
    en: "Upcoming",
    ru: "Предстоящие",
  }),
  ui_reminders_empty_my: m({
    en: "No reminders scheduled.",
    ru: "Напоминаний не запланировано.",
  }),
  ui_reminders_footer_my: m({
    en: "Ask the bot in chat to schedule a reminder.",
    ru: "Попроси бота в чате запланировать напоминание.",
  }),
  ui_reminders_admin_header: m({
    en: "All Reminders",
    ru: "Все напоминания",
  }),
  ui_reminders_admin_empty: m({
    en: "No reminders scheduled by anyone.",
    ru: "Никто пока не запланировал напоминаний.",
  }),
  ui_reminders_admin_footer: m({
    en: "Pending reminders across all users. Failed deliveries that hit a transient error stay until they succeed or hit a permanent failure.",
    ru: "Ожидающие напоминания всех пользователей. Доставки с временными ошибками остаются до успешной или окончательной ошибки.",
  }),
  ui_reminders_dm: m({
    en: "DM",
    ru: "ЛС",
  }),
  ui_reminders_chat_fallback: m({
    en: (id: string) => `chat ${id}`,
    ru: (id: string) => `чат ${id}`,
  }),
};
