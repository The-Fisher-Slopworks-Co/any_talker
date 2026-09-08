// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { m } from "./message";
import { etaEn, etaRu } from "./eta";

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
  ui_quarantine_header: m({
    en: "Quarantined",
    ru: "Карантин",
  }),
  ui_quarantine_empty: m({
    en: "Nothing was rejected — every stored reminder parsed cleanly.",
    ru: "Ничего не отбраковано — все сохранённые напоминания разобрались.",
  }),
  ui_quarantine_footer: m({
    en: "Reminders the delivery pass could not parse. The raw payload is kept for 30 days so a parser fix can still recover it; after that it is gone.",
    ru: "Напоминания, которые не смог разобрать проход доставки. Сырые данные хранятся 30 дней, чтобы их можно было восстановить после починки парсера; потом они пропадают.",
  }),
  ui_quarantine_reason_invalid_json: m({
    en: "Not valid JSON",
    ru: "Невалидный JSON",
  }),
  ui_quarantine_reason_schema_violation: m({
    en: "Does not match the schema",
    ru: "Не соответствует схеме",
  }),
  ui_quarantine_expires_in: m({
    en: (ms: number) => `expires in ~${etaEn(ms)}`,
    ru: (ms: number) => `истекает через ~${etaRu(ms)}`,
  }),
  ui_quarantine_expired: m({
    en: "expired",
    ru: "истекло",
  }),
  ui_quarantine_show_payload: m({
    en: "Show payload",
    ru: "Показать данные",
  }),
  ui_quarantine_hide_payload: m({
    en: "Hide payload",
    ru: "Скрыть данные",
  }),
  ui_quarantine_copy: m({
    en: "Copy",
    ru: "Копировать",
  }),
  ui_quarantine_copied: m({
    en: "Copied",
    ru: "Скопировано",
  }),
  ui_quarantine_user: m({
    en: (id: string) => `user ${id}`,
    ru: (id: string) => `пользователь ${id}`,
  }),
  ui_reminders_dm: m({
    en: "DM",
    ru: "ЛС",
  }),
  ui_reminders_chat_fallback: m({
    en: (id: string) => `chat ${id}`,
    ru: (id: string) => `чат ${id}`,
  }),
  // Sent to the chat that was supposed to receive the reminder, after the
  // scheduler has given up on it. Says what was lost and that nothing more
  // will happen, without naming the internal failure reason — "permanent
  // delivery failure" is an operator's word, not the user's.
  reminders_delivery_failed: m({
    en: (note: string) =>
      `⚠️ I could not deliver your reminder “${note}”. It will not fire — set it again if you still need it.`,
    ru: (note: string) =>
      `⚠️ Не удалось доставить напоминание «${note}». Оно не сработает — поставь его заново, если оно ещё нужно.`,
  }),
  // The same notice for a quarantined record whose note could not be read
  // back from the stored payload: there is nothing to quote.
  reminders_delivery_failed_no_note: m({
    en: "⚠️ I could not deliver one of your reminders. It will not fire — set it again if you still need it.",
    ru: "⚠️ Не удалось доставить одно из твоих напоминаний. Оно не сработает — поставь его заново, если оно ещё нужно.",
  }),
};
