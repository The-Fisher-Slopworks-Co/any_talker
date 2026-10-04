// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { m } from "./message";

// Scheduled check-ins: the admin list and the check editor.
export const checksMessages = {
  ui_route_checks: m({
    en: "Checks",
    ru: "Чеки",
  }),
  ui_route_check_edit: m({
    en: "Edit Check",
    ru: "Чек",
  }),
  ui_route_check_create: m({
    en: "New Check",
    ru: "Новый чек",
  }),
  ui_checks_footer: m({
    en: "Daily question; no answer counts as No.",
    ru: "Ежедневный вопрос; нет ответа — это «Нет».",
  }),
  ui_checks_enabled: m({
    en: "Enabled",
    ru: "Включён",
  }),
  ui_checks_disabled: m({
    en: "Paused",
    ru: "Пауза",
  }),
  ui_checks_status: m({
    en: "Status",
    ru: "Статус",
  }),
  ui_check_title: m({
    en: "Title",
    ru: "Название",
  }),
  ui_check_title_placeholder: m({
    en: "e.g. Sport for Nikita",
    ru: "напр. Спорт для Никиты",
  }),
  ui_check_recipient: m({
    en: "Recipient",
    ru: "Получатель",
  }),
  ui_check_chat_id: m({
    en: "Chat ID",
    ru: "ID чата",
  }),
  ui_check_chat_id_placeholder: m({
    en: "-100123456789",
    ru: "-100123456789",
  }),
  ui_check_target_user_id: m({
    en: "User ID",
    ru: "ID пользователя",
  }),
  ui_check_target_user_id_placeholder: m({
    en: "123456789",
    ru: "123456789",
  }),
  ui_check_target_name: m({
    en: "Name Shown",
    ru: "Имя в сообщениях",
  }),
  ui_check_target_name_placeholder: m({
    en: "Nikita",
    ru: "Никита",
  }),
  ui_check_target_name_footer: m({
    en: "Replaces {name}. Mentions the user in the question; plain text in replies.",
    ru: "Заменяет {name}. В вопросе — упоминание, в ответах — текст.",
  }),
  ui_check_schedule: m({
    en: "Time",
    ru: "Время",
  }),
  ui_check_timezone: m({
    en: "Timezone",
    ru: "Часовой пояс",
  }),
  ui_check_timeout: m({
    en: "Timeout (minutes)",
    ru: "Таймаут (минуты)",
  }),
  ui_check_timeout_footer: m({
    en: "No answer by then counts as No.",
    ru: "Нет ответа к этому сроку — «Нет».",
  }),
  ui_check_question: m({
    en: "Question",
    ru: "Вопрос",
  }),
  ui_check_question_placeholder: m({
    en: "{name}, did you do sport today?",
    ru: "{name}, занялся ли ты сегодня спортом?",
  }),
  ui_check_question_footer: m({
    en: "{name} mentions the user; {count} is the counter.",
    ru: "{name} — упоминание; {count} — счётчик.",
  }),
  ui_check_yes_button: m({
    en: '"Yes" button label',
    ru: "Подпись кнопки «Да»",
  }),
  ui_check_no_button: m({
    en: '"No" button label',
    ru: "Подпись кнопки «Нет»",
  }),
  ui_check_yes_reply: m({
    en: "Reply when Yes",
    ru: "Ответ при «Да»",
  }),
  ui_check_yes_reply_placeholder: m({
    en: "{name}, at least don't lie to yourself. Day without sport {count}",
    ru: "{name}, хотя бы себе не ври. День без спорта {count}",
  }),
  ui_check_no_reply: m({
    en: "Reply when No / timeout",
    ru: "Ответ при «Нет» / таймауте",
  }),
  ui_check_no_reply_placeholder: m({
    en: "{name}. Day without sport {count}",
    ru: "{name}. День без спорта {count}",
  }),
  ui_check_replies_footer: m({
    en: "{name} is plain text; {count} is the counter after this answer.",
    ru: "{name} — текст; {count} — счётчик после ответа.",
  }),
  ui_check_counter: m({
    en: "Counter",
    ru: "Счётчик",
  }),
  ui_check_counter_footer: m({
    en: "Value of {count}.",
    ru: "Значение {count}.",
  }),
  ui_check_counter_source: m({
    en: "Counter source",
    ru: "Источник счётчика",
  }),
  ui_check_counter_source_manual: m({
    en: "Manual number",
    ru: "Ручное число",
  }),
  ui_check_counter_source_date: m({
    en: "Days since a date",
    ru: "Дни с даты",
  }),
  ui_check_counter_anchor_date: m({
    en: "Anchor date",
    ru: "Опорная дата",
  }),
  ui_check_counter_anchor_date_footer: m({
    en: "{count} = days since this date. Reset mode moves it to today on Yes.",
    ru: "{count} — дни с этой даты. При сбросе «Да» переносит её на сегодня.",
  }),
  ui_check_counter_mode: m({
    en: "Counter on Yes",
    ru: "Счётчик при «Да»",
  }),
  ui_check_counter_mode_always: m({
    en: "Always increment",
    ru: "Всегда увеличивать",
  }),
  ui_check_counter_mode_reset: m({
    en: "Reset to 0",
    ru: "Сбрасывать в 0",
  }),
  ui_check_enabled_label: m({
    en: "Enabled",
    ru: "Включён",
  }),
  ui_check_delete: m({
    en: "Delete check",
    ru: "Удалить чек",
  }),
  ui_check_delete_confirm: m({
    en: "Delete this check?",
    ru: "Удалить чек?",
  }),
  ui_check_not_found: m({
    en: "Check not found.",
    ru: "Чек не найден.",
  }),
  ui_check_last_fired: m({
    en: "Last fired",
    ru: "Последний раз",
  }),
  ui_check_last_fired_never: m({
    en: "Never",
    ru: "Никогда",
  }),
  ui_check_pending: m({
    en: "Pending reply",
    ru: "Ждёт ответа",
  }),
  ui_check_pending_yes: m({
    en: "Yes",
    ru: "Да",
  }),
  ui_check_pending_no: m({
    en: "No",
    ru: "Нет",
  }),
  ui_check_save_validation_error: m({
    en: (code: string) => `Validation error: ${code}`,
    ru: (code: string) => `Ошибка валидации: ${code}`,
  }),
};
