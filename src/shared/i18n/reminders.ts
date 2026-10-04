// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { m } from "./message";
import { pluralEn, pluralRu } from "./plural";

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
    en: "Ask the bot in chat to add one.",
    ru: "Попроси бота в чате добавить.",
  }),
  ui_reminders_admin_header: m({
    en: "All Reminders",
    ru: "Все напоминания",
  }),
  ui_reminders_admin_empty: m({
    en: "No reminders.",
    ru: "Напоминаний нет.",
  }),
  ui_reminders_admin_footer: m({
    en: "Failed deliveries are retried.",
    ru: "Неудачная доставка повторяется.",
  }),
  ui_reminders_edit: m({
    en: "Edit",
    ru: "Изменить",
  }),
  ui_reminders_cancel: m({
    en: "Cancel",
    ru: "Отмена",
  }),
  ui_reminders_fire_at_label: m({
    en: "Fires at",
    ru: "Сработает",
  }),
  ui_reminders_delete_confirm: m({
    en: "Delete this reminder? The author isn't notified.",
    ru: "Удалить напоминание? Автор не узнает.",
  }),
  ui_reminders_fire_at_too_soon: m({
    en: "Pick a time at least a minute ahead.",
    ru: "Выбери время минимум через минуту.",
  }),
  ui_reminders_save_error: m({
    en: (code: string) => `Could not save: ${code}`,
    ru: (code: string) => `Не удалось сохранить: ${code}`,
  }),
  ui_reminders_cap_header: m({
    en: "Per-User Limit",
    ru: "Лимит на пользователя",
  }),
  ui_reminders_cap_label: m({
    en: "Max reminders",
    ru: "Максимум напоминаний",
  }),
  ui_reminders_cap_footer: m({
    en: "Per user, across all characters. Lowering it keeps existing reminders.",
    ru: "На пользователя, по всем персонажам. Понижение не трогает существующие.",
  }),
  ui_quarantine_empty: m({
    en: "Nothing quarantined.",
    ru: "Карантин пуст.",
  }),
  ui_quarantine_footer: m({
    en: "Reminders that failed to parse. Raw payload is kept 30 days.",
    ru: "Напоминания, которые не удалось разобрать. Данные хранятся 30 дней.",
  }),
  ui_quarantine_reason_invalid_json: m({
    en: "Not valid JSON",
    ru: "Невалидный JSON",
  }),
  ui_quarantine_reason_schema_violation: m({
    en: "Does not match the schema",
    ru: "Не соответствует схеме",
  }),
  // What is left of the retention window, rounded up to whole days.
  ui_quarantine_days_left: m({
    en: (ms: number) => pluralEn(Math.ceil(ms / 86_400_000), "day", "days"),
    ru: (ms: number) =>
      pluralRu(Math.ceil(ms / 86_400_000), "день", "дня", "дней"),
  }),
  ui_quarantine_expired: m({
    en: "Expired",
    ru: "Истекло",
  }),
  ui_quarantine_payload: m({
    en: "Payload",
    ru: "Данные",
  }),
  ui_quarantine_id: m({
    en: "ID",
    ru: "ID",
  }),
  ui_quarantine_expires: m({
    en: "Expires",
    ru: "Истекает",
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
    en: "User",
    ru: "Пользователь",
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
