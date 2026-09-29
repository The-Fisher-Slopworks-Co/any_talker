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
    ru: "Редактирование чека",
  }),
  ui_route_check_create: m({
    en: "New Check",
    ru: "Новый чек",
  }),
  ui_checks_all: m({
    en: "Recurring Checks",
    ru: "Циклические чеки",
  }),
  ui_checks_empty: m({
    en: 'No checks yet. Tap "New check" to create one.',
    ru: "Чеков ещё нет. Нажми «Новый чек», чтобы создать.",
  }),
  ui_checks_footer: m({
    en: "Each check sends a question at a daily time. The target user taps Yes/No; non-answers time out as No.",
    ru: "Каждый чек присылает вопрос в указанное время. Целевой пользователь жмёт Да/Нет; отсутствие ответа считается как Нет.",
  }),
  ui_checks_create: m({
    en: "New check",
    ru: "Новый чек",
  }),
  ui_checks_enabled: m({
    en: "Enabled",
    ru: "Включён",
  }),
  ui_checks_disabled: m({
    en: "Paused",
    ru: "Пауза",
  }),
  ui_checks_paused_marker: m({
    en: "paused",
    ru: "пауза",
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
  ui_check_chat_id: m({
    en: "Chat ID",
    ru: "ID чата",
  }),
  ui_check_chat_id_placeholder: m({
    en: "-100123456789",
    ru: "-100123456789",
  }),
  ui_check_chat_id_footer: m({
    en: "Numeric Telegram chat ID where the question gets posted. For supergroups it starts with -100.",
    ru: "Числовой ID чата Telegram, куда отправляется вопрос. У супергрупп начинается с -100.",
  }),
  ui_check_target_user_id: m({
    en: "Target user ID",
    ru: "ID пользователя",
  }),
  ui_check_target_user_id_placeholder: m({
    en: "123456789",
    ru: "123456789",
  }),
  ui_check_target_user_id_footer: m({
    en: "Numeric user ID who is being asked. Only this user's clicks count.",
    ru: "Числовой ID того, кому задаётся вопрос. Только клики этого пользователя засчитываются.",
  }),
  ui_check_target_name: m({
    en: "Name shown",
    ru: "Имя в сообщениях",
  }),
  ui_check_target_name_placeholder: m({
    en: "Nikita",
    ru: "Никита",
  }),
  ui_check_target_name_footer: m({
    en: "Substituted for {name} in the question and replies. In the question it renders as a clickable mention that pings the user; in replies it appears as plain text.",
    ru: "Подставляется на место {name} в вопросе и ответах. В вопросе — как кликабельное упоминание, пингующее пользователя; в ответах — просто текстом.",
  }),
  ui_check_schedule: m({
    en: "Time",
    ru: "Время",
  }),
  ui_check_schedule_footer: m({
    en: "Daily wall-clock time in the timezone below. The bot fires at most once per day.",
    ru: "Время суток в указанном ниже часовом поясе. Бот сработает не больше одного раза в сутки.",
  }),
  ui_check_timezone: m({
    en: "Timezone",
    ru: "Часовой пояс",
  }),
  ui_check_timezone_footer: m({
    en: "Timezone used to interpret the daily time above.",
    ru: "Часовой пояс, в котором интерпретируется время выше.",
  }),
  ui_check_timeout: m({
    en: "Timeout (minutes)",
    ru: "Таймаут (минуты)",
  }),
  ui_check_timeout_footer: m({
    en: "If the user hasn't clicked within this many minutes, the check resolves as if they tapped No.",
    ru: "Если за это время пользователь не нажал кнопку, чек резолвится как «Нет».",
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
    en: "Sent at the scheduled time. {name} becomes a clickable mention that pings the user; {count} is the current counter.",
    ru: "Отправляется в назначенное время. {name} — кликабельное упоминание, пингующее пользователя; {count} — текущий счётчик.",
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
    en: "{name} is the target's plain-text name (no mention); {count} is the counter after this answer.",
    ru: "{name} — имя пользователя обычным текстом (без упоминания); {count} — счётчик после этого ответа.",
  }),
  ui_check_counter: m({
    en: "Counter",
    ru: "Счётчик",
  }),
  ui_check_counter_footer: m({
    en: "Current value of {count}. Adjust manually if needed.",
    ru: "Текущее значение {count}. При необходимости можно поправить вручную.",
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
  ui_check_counter_source_footer: m({
    en: "Manual: counter is stored and adjusted on each answer. Days since a date: {count} is computed live as the number of days from the anchor date to today in the check's timezone.",
    ru: "«Ручное число» — счётчик хранится и меняется на ответы. «Дни с даты» — {count} вычисляется как число дней от опорной даты до сегодня в часовом поясе чека.",
  }),
  ui_check_counter_anchor_date: m({
    en: "Anchor date",
    ru: "Опорная дата",
  }),
  ui_check_counter_anchor_date_footer: m({
    en: '{count} = days from this date to today. With "Reset to 0 on Yes", a Yes answer moves the anchor to today.',
    ru: "{count} — количество дней от этой даты до сегодня. При режиме «Сбрасывать в 0 при Да» ответ «Да» переносит опорную дату на сегодня.",
  }),
  ui_check_counter_mode: m({
    en: "Counter on Yes",
    ru: "Счётчик при «Да»",
  }),
  ui_check_counter_mode_always: m({
    en: "Always increment (trolling mode)",
    ru: "Всегда увеличивать (режим подколки)",
  }),
  ui_check_counter_mode_reset: m({
    en: "Reset to 0 (real streak)",
    ru: "Сбрасывать в 0 (настоящий стрик)",
  }),
  ui_check_counter_mode_footer: m({
    en: "Always increment: counter grows whatever the user clicks. Reset on Yes: streak resets when the user confirms.",
    ru: "«Всегда увеличивать» — счётчик растёт независимо от ответа. «Сбрасывать» — обнуляется при «Да».",
  }),
  ui_check_enabled_label: m({
    en: "Enabled",
    ru: "Включён",
  }),
  ui_check_enabled_footer: m({
    en: "Disabled checks neither fire nor time out. Pending question messages stay in the chat until resumed.",
    ru: "Выключенный чек не срабатывает и не таймаутится. Уже висящее сообщение с кнопками остаётся в чате до включения.",
  }),
  ui_check_delete: m({
    en: "Delete check",
    ru: "Удалить чек",
  }),
  ui_check_delete_confirm: m({
    en: "Delete this check? This cannot be undone.",
    ru: "Удалить чек? Действие нельзя отменить.",
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
