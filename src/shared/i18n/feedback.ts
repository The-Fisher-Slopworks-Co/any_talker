// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { m } from "./message";
import { pluralEn, pluralRu } from "./plural";

// `/feedback` — everything the command says back, and the admin tab that reads
// what it stored. In a group each of the command's lines is sent ephemerally, so
// they address the reporter rather than the chat.
export const feedbackMessages = {
  // Names the command with its argument, so the hint is copy-pasteable.
  bot_feedback_usage: m({
    en: "Usage: /feedback what went wrong. Reply to my message to point at it.",
    ru: "Использование: /feedback что пошло не так. Ответь на моё сообщение, чтобы указать на него.",
  }),
  // The report is only stored, so the line stops at that: nothing forwards it.
  bot_feedback_recorded: m({
    en: "Your report is saved.",
    ru: "Отчёт сохранён.",
  }),
  bot_feedback_limited: m({
    en: "Too many reports. Send the rest tomorrow.",
    ru: "Слишком много отчётов. Отправь остальные завтра.",
  }),

  // The admin section, named like the other tabs (`ui_admin_*`) but kept in this
  // module, the way `ui_admin_bots` sits with the managed bots.
  ui_admin_feedback: m({
    en: "Feedback",
    ru: "Обратная связь",
  }),
  ui_feedback_empty: m({
    en: "No reports yet.",
    ru: "Пока нет отчётов.",
  }),
  // The filter names sets of reports, so Russian puts its options in the
  // plural — next to "Все" a singular option reads as a different kind of
  // control.
  ui_feedback_filter_all: m({
    en: "All",
    ru: "Все",
  }),
  ui_feedback_filter_new: m({
    en: "New",
    ru: "Новые",
  }),
  ui_feedback_filter_closed: m({
    en: "Closed",
    ru: "Закрытые",
  }),
  // The badge on a row, which stands for the one report it sits on, and so
  // stays singular where the filter above does not.
  ui_feedback_status_new: m({
    en: "New",
    ru: "Новый",
  }),
  ui_feedback_status_closed: m({
    en: "Closed",
    ru: "Закрыт",
  }),
  // How many threads came with the report, declined: Russian gets all three of
  // its forms.
  ui_feedback_thread_count: m({
    en: (n: number) => pluralEn(n, "thread", "threads"),
    ru: (n: number) => pluralRu(n, "диалог", "диалога", "диалогов"),
  }),
  ui_feedback_load_more: m({
    en: "Load More",
    ru: "Показать ещё",
  }),
  ui_feedback_delete_confirm: m({
    en: "Delete this report and its thread snapshot?",
    ru: "Удалить отчёт и снимок диалогов?",
  }),

  // The red action behind a swiped row.
  ui_feedback_delete: m({
    en: "Delete",
    ru: "Удалить",
  }),

  // The detail view a row opens into. Deliberately plain: the record's fields,
  // the snapshot as the JSON it is stored as, and the generation ids as links
  // out to openrouter.ai.
  ui_feedback_delete_report: m({
    en: "Delete Report",
    ru: "Удалить отчёт",
  }),
  ui_route_feedback: m({
    en: "Report",
    ru: "Отчёт",
  }),
  ui_feedback_not_found: m({
    en: "Report not found.",
    ru: "Отчёт не найден.",
  }),
  ui_feedback_record_header: m({
    en: "Report",
    ru: "Отчёт",
  }),
  ui_feedback_field_sent: m({
    en: "Sent",
    ru: "Отправлен",
  }),
  ui_feedback_field_user: m({
    en: "User",
    ru: "Пользователь",
  }),
  // Appended to the user id when the report came from a guest-mode chat.
  ui_feedback_guest_marker: m({
    en: "guest",
    ru: "гость",
  }),
  ui_feedback_field_chat: m({
    en: "Chat",
    ru: "Чат",
  }),
  ui_feedback_field_bot: m({
    en: "Bot",
    ru: "Бот",
  }),
  ui_feedback_field_lang: m({
    en: "Language",
    ru: "Язык",
  }),
  ui_feedback_field_build: m({
    en: "Build",
    ru: "Сборка",
  }),
  ui_feedback_field_prompt_hash: m({
    en: "Prompt hash",
    ru: "Хеш промпта",
  }),
  // The bot message the command replied to, when it was sent as a reply.
  ui_feedback_field_pointed_at: m({
    en: "Pointed at",
    ru: "Указывает на",
  }),
  ui_feedback_pointed_value: m({
    en: (chatId: string, botMsgId: number) => `${chatId} · msg ${botMsgId}`,
    ru: (chatId: string, botMsgId: number) => `${chatId} · сообщ. ${botMsgId}`,
  }),
  // A normal state, not an error: the thread a reporter pointed at can have
  // expired before the snapshot was taken.
  ui_feedback_pointed_missing: m({
    en: "The pointed-at message isn't in the snapshot; its thread had expired.",
    ru: "Сообщения нет в снимке: его диалог истёк.",
  }),
  ui_feedback_pointed_here: m({
    en: "Pointed At",
    ru: "Указан",
  }),
  ui_feedback_status_header: m({
    en: "Status",
    ru: "Статус",
  }),
  ui_feedback_text_header: m({
    en: "What was reported",
    ru: "Что сообщили",
  }),
  ui_feedback_threads_header: m({
    en: "Threads",
    ru: "Диалоги",
  }),
  ui_feedback_threads_footer: m({
    en: "Copied verbatim. Generation ids link to openrouter.ai (login required).",
    ru: "Копия дословно. Id генераций ведут на openrouter.ai (нужен вход).",
  }),
  ui_feedback_threads_empty: m({
    en: "No threads: they had expired.",
    ru: "Диалогов нет: они истекли.",
  }),
  ui_feedback_thread_chain: m({
    en: "Chain",
    ru: "Цепочка",
  }),
  ui_feedback_thread_guest: m({
    en: "Guest",
    ru: "Гостевой",
  }),
  // `chat` is the chat's title, or its id when the directory has no title.
  ui_feedback_thread_meta: m({
    en: (index: number, chat: string, turns: number) =>
      `#${index} · ${chat} · ${pluralEn(turns, "turn", "turns")}`,
    ru: (index: number, chat: string, turns: number) =>
      `#${index} · ${chat} · ${pluralRu(turns, "ход", "хода", "ходов")}`,
  }),
  ui_feedback_gens: m({
    en: "Generations",
    ru: "Генерации",
  }),
  // Turns written before run metadata existed, and turns that never reached the
  // model, carry no ids.
  ui_feedback_gens_empty: m({
    en: "None",
    ru: "Нет",
  }),
  ui_feedback_prompt_header: m({
    en: "System prompt",
    ru: "Системный промпт",
  }),
  ui_feedback_prompt_footer: m({
    en: "As rendered when the report was sent. A turn whose run.instr differs from the hash ran on another prompt.",
    ru: "Как был собран при отправке. Ход с другим run.instr шёл на другом промпте.",
  }),
};
