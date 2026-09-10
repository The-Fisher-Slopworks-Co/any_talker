// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { m } from "./message";

// `/feedback` — everything the command says back. In a group each line is sent
// ephemerally, so they address the reporter rather than the chat.
export const feedbackMessages = {
  // Names the command with its argument, so the hint is copy-pasteable.
  bot_feedback_usage: m({
    en: "Send it in one message: /feedback what went wrong. Reply to my message to point at it.",
    ru: "Отправь одним сообщением: /feedback что пошло не так. Ответь на моё сообщение, чтобы указать на него.",
  }),
  bot_feedback_recorded: m({
    en: "Thanks — saved along with your recent conversations, so the problem can be reproduced.",
    ru: "Спасибо — записал вместе с твоими последними диалогами, чтобы проблему можно было воспроизвести.",
  }),
  // The cap is named: a limit whose shape is invisible reads as a broken bot.
  bot_feedback_limited: m({
    en: (perDay: number) =>
      `You have already sent ${perDay} reports today — the rest will have to wait until tomorrow.`,
    ru: (perDay: number) =>
      `Сегодня уже отправлено отчётов: ${perDay} — остальное придётся отложить до завтра.`,
  }),
};
