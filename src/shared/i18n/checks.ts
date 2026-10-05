// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { ValidationError } from "../../checks/types";
import { m } from "./message";

// What the check editor says about a field the server refuses; a new error code
// is a type error here until both languages word it.
const EN_ERRORS = {
  title_empty: "Enter a title.",
  question_empty: "Enter the question.",
  chat_id_empty: "Enter a chat ID.",
  target_user_id_empty: "Enter a user ID.",
  target_name_empty: "Enter the name to show.",
  schedule_hour_invalid: "Pick a time.",
  schedule_minute_invalid: "Pick a time.",
  timezone_invalid: "Pick a timezone.",
  timeout_minutes_invalid: "Timeout must be 1 to 1440 minutes.",
  yes_button_empty: "Enter the Yes label.",
  no_button_empty: "Enter the No label.",
  yes_reply_empty: "Enter the reply for Yes.",
  no_reply_empty: "Enter the reply for No.",
  counter_invalid: "Value must be a whole number, 0 or more.",
  counter_mode_invalid: "Pick what Yes does to the counter.",
  counter_anchor_date_invalid: "Pick a valid start date.",
} satisfies Record<ValidationError, string>;

const RU_ERRORS = {
  title_empty: "Укажите название.",
  question_empty: "Укажите вопрос.",
  chat_id_empty: "Укажите ID чата.",
  target_user_id_empty: "Укажите ID пользователя.",
  target_name_empty: "Укажите имя для сообщений.",
  schedule_hour_invalid: "Выберите время.",
  schedule_minute_invalid: "Выберите время.",
  timezone_invalid: "Выберите часовой пояс.",
  timeout_minutes_invalid: "Таймаут — от 1 до 1440 минут.",
  yes_button_empty: "Укажите подпись «Да».",
  no_button_empty: "Укажите подпись «Нет».",
  yes_reply_empty: "Укажите ответ при «Да».",
  no_reply_empty: "Укажите ответ при «Нет».",
  counter_invalid: "Значение — целое число, 0 или больше.",
  counter_mode_invalid: "Выберите, что «Да» делает со счётчиком.",
  counter_anchor_date_invalid: "Выберите корректную дату начала.",
} satisfies Record<ValidationError, string>;

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
  ui_check_schedule_header: m({
    en: "Schedule",
    ru: "Расписание",
  }),
  ui_check_schedule: m({
    en: "Time",
    ru: "Время",
  }),
  ui_check_timeout: m({
    en: "Timeout",
    ru: "Таймаут",
  }),
  ui_check_timeout_unit: m({
    en: "min",
    ru: "мин",
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
  ui_check_buttons: m({
    en: "Buttons",
    ru: "Кнопки",
  }),
  ui_check_yes_button: m({
    en: "Yes Label",
    ru: "Подпись «Да»",
  }),
  ui_check_no_button: m({
    en: "No Label",
    ru: "Подпись «Нет»",
  }),
  ui_check_replies: m({
    en: "Replies",
    ru: "Ответы",
  }),
  ui_check_yes_reply: m({
    en: "When Yes",
    ru: "При «Да»",
  }),
  ui_check_yes_reply_placeholder: m({
    en: "{name}, at least don't lie to yourself. Day without sport {count}",
    ru: "{name}, хотя бы себе не ври. День без спорта {count}",
  }),
  ui_check_no_reply: m({
    en: "When No / Timeout",
    ru: "При «Нет» / таймауте",
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
  ui_check_counter_value: m({
    en: "Value",
    ru: "Значение",
  }),
  ui_check_counter_footer: m({
    en: "Value of {count}.",
    ru: "Значение {count}.",
  }),
  ui_check_counter_source: m({
    en: "Source",
    ru: "Источник",
  }),
  ui_check_counter_source_manual: m({
    en: "Manual Number",
    ru: "Ручное число",
  }),
  ui_check_counter_source_date: m({
    en: "Days Since a Date",
    ru: "Дни с даты",
  }),
  ui_check_counter_anchor_date: m({
    en: "Start Date",
    ru: "Дата начала",
  }),
  ui_check_counter_anchor_date_footer: m({
    en: "{count} = days since this date. Reset mode moves it to today on Yes.",
    ru: "{count} — дни с этой даты. При сбросе «Да» переносит её на сегодня.",
  }),
  ui_check_counter_mode: m({
    en: "On Yes",
    ru: "При «Да»",
  }),
  ui_check_counter_mode_always: m({
    en: "Always Increment",
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
  ui_check_create: m({
    en: "Create Check",
    ru: "Создать чек",
  }),
  ui_check_delete: m({
    en: "Delete Check",
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
    en: "Last Fired",
    ru: "Последний раз",
  }),
  ui_check_last_fired_never: m({
    en: "Never",
    ru: "Никогда",
  }),
  ui_check_pending: m({
    en: "Pending Reply",
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
  ui_check_error: m({
    en: (code: ValidationError) => EN_ERRORS[code],
    ru: (code: ValidationError) => RU_ERRORS[code],
  }),
};
