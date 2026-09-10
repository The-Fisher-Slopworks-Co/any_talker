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
  ui_admin_feedback_desc: m({
    en: "What users reported with /feedback",
    ru: "Что пользователи сообщили через /feedback",
  }),
  ui_feedback_empty: m({
    en: "Nothing here — no report has come in through /feedback.",
    ru: "Пусто — через /feedback не пришло ни одного отчёта.",
  }),
  ui_feedback_footer: m({
    en: "What users sent with /feedback, newest first. Each report carries a snapshot of the reporter's recent threads, taken when it was sent; deleting the report drops that snapshot with it.",
    ru: "То, что пользователи отправили через /feedback, сначала новые. В каждом отчёте — снимок последних диалогов автора, сделанный в момент отправки; удаление отчёта уносит снимок вместе с ним.",
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
  // How much of a snapshot came with the report, declined: a row reads as a
  // phrase rather than two labels, and Russian gets all three of its forms.
  ui_feedback_counts: m({
    en: (n: number, turns: number) =>
      `${pluralEn(n, "thread", "threads")} · ${pluralEn(turns, "turn", "turns")}`,
    ru: (n: number, turns: number) =>
      `${pluralRu(n, "диалог", "диалога", "диалогов")} · ${pluralRu(turns, "ход", "хода", "ходов")}`,
  }),
  ui_feedback_load_more: m({
    en: "Load more",
    ru: "Показать ещё",
  }),
  ui_feedback_delete_confirm: m({
    en: "Delete this report? The thread snapshot goes with it, and the threads it copied may already have expired.",
    ru: "Удалить этот отчёт? Снимок диалогов уйдёт вместе с ним, а сами диалоги могли уже истечь.",
  }),

  // The detail view a row opens into. Deliberately plain: the record's fields,
  // the snapshot as the JSON it is stored as, and the generation ids as links
  // out to openrouter.ai.
  ui_feedback_open: m({
    en: "Open",
    ru: "Открыть",
  }),
  ui_route_feedback: m({
    en: "Report",
    ru: "Отчёт",
  }),
  ui_feedback_not_found: m({
    en: "No such report — it may have been deleted since the list was loaded.",
    ru: "Такого отчёта нет — возможно, его удалили после того, как список загрузился.",
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
    en: "The message this report pointed at is in none of the snapshotted threads — that thread had already expired.",
    ru: "Сообщение, на которое указывает отчёт, не попало ни в один снятый диалог — тот успел истечь.",
  }),
  ui_feedback_pointed_here: m({
    en: "pointed at",
    ru: "указан",
  }),
  ui_feedback_status_header: m({
    en: "Status",
    ru: "Статус",
  }),
  ui_feedback_status_footer: m({
    en: "Closed is what marks a report as processed — for an analysing agent, and for whoever reads the list next. Nothing else about the record changes.",
    ru: "«Закрыт» помечает отчёт как обработанный — и для анализирующего агента, и для того, кто откроет список следующим. Больше в записи ничего не меняется.",
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
    en: "Each thread as it was copied into the record, verbatim. A generation id links into openrouter.ai, where the activity list is what resolves it — behind that account's own login.",
    ru: "Каждый диалог — в том виде, в каком он попал в запись, дословно. Id генерации ведёт на openrouter.ai: разрешает его список активности, за логином того же аккаунта.",
  }),
  ui_feedback_threads_empty: m({
    en: "No threads in this snapshot — they had expired by the time the report was sent.",
    ru: "В снимке нет диалогов — к моменту отправки отчёта они уже истекли.",
  }),
  ui_feedback_thread_chain: m({
    en: "chain",
    ru: "цепочка",
  }),
  ui_feedback_thread_guest: m({
    en: "guest",
    ru: "гостевой",
  }),
  ui_feedback_thread_meta: m({
    en: (index: number, chatId: string, turns: number) =>
      `#${index} · chat ${chatId} · turns: ${turns}`,
    ru: (index: number, chatId: string, turns: number) =>
      `#${index} · чат ${chatId} · ходов: ${turns}`,
  }),
  ui_feedback_gens: m({
    en: "Generations:",
    ru: "Генерации:",
  }),
  // Turns written before run metadata existed, and turns that never reached the
  // model, carry no ids.
  ui_feedback_gens_empty: m({
    en: "no generation ids",
    ru: "нет id генераций",
  }),
  ui_feedback_prompt_header: m({
    en: "System prompt",
    ru: "Системный промпт",
  }),
  ui_feedback_prompt_footer: m({
    en: "As it was rendered when the report was sent. A turn whose run.instr differs from the hash above ran on a different prompt.",
    ru: "В том виде, в каком он был собран при отправке отчёта. Ход, у которого run.instr не совпадает с хешем выше, шёл на другом промпте.",
  }),
};
