// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { m } from "./message";

// `/feedback` — everything the command says back. In a group each line is sent
// ephemerally, so they address the reporter rather than the chat.
export const feedbackMessages = {
  // Names the command with its argument, so the hint is copy-pasteable.
  bot_feedback_usage: m({
    en: "Usage: /feedback what went wrong. Reply to my message to point at it.",
    ru: "Использование: /feedback что пошло не так. Ответь на моё сообщение, чтобы указать на него.",
  }),
  // The report is only stored, so the line stops at that: nothing forwards it.
  bot_feedback_recorded: m({
    en: "Thanks — your report is saved.",
    ru: "Спасибо — отчёт сохранён.",
  }),
  bot_feedback_limited: m({
    en: "Too many reports. Send the rest tomorrow.",
    ru: "Слишком много отчётов. Отправь остальные завтра.",
  }),
};
