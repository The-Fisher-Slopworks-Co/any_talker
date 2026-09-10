// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { m } from "./message";

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
  // Both the status filter and the per-row badge.
  ui_feedback_filter_all: m({
    en: "All",
    ru: "Все",
  }),
  ui_feedback_status_new: m({
    en: "New",
    ru: "Новый",
  }),
  ui_feedback_status_closed: m({
    en: "Closed",
    ru: "Закрыт",
  }),
  // Counted, not declined: a plural form would say no more than the numbers do.
  ui_feedback_counts: m({
    en: (n: number, turns: number) => `threads: ${n} · turns: ${turns}`,
    ru: (n: number, turns: number) => `диалогов: ${n} · ходов: ${turns}`,
  }),
  ui_feedback_load_more: m({
    en: "Load more",
    ru: "Показать ещё",
  }),
  ui_feedback_delete_confirm: m({
    en: "Delete this report? The thread snapshot goes with it, and the threads it copied may already have expired.",
    ru: "Удалить этот отчёт? Снимок диалогов уйдёт вместе с ним, а сами диалоги могли уже истечь.",
  }),
};
