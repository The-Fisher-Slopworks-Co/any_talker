// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { etaEn, etaRu } from "./eta";
import { m } from "./message";

// Rate-limit settings and the viewer's own usage bars.
export const rateLimitMessages = {
  ui_ratelimit_limits: m({
    en: "Limits",
    ru: "Лимиты",
  }),
  ui_ratelimit_5h_tokens: m({
    en: "5-hour limit",
    ru: "Лимит за 5 часов",
  }),
  ui_ratelimit_weekly_tokens: m({
    en: "Weekly limit",
    ru: "Недельный лимит",
  }),
  ui_ratelimit_owner_exempt: m({
    en: "Owner exempt",
    ru: "Владелец без лимита",
  }),
  ui_ratelimit_wise_multiplier: m({
    en: "/askwise multiplier",
    ru: "Коэффициент /askwise",
  }),
  ui_ratelimit_footer: m({
    en: "Each user has two token budgets — one per rolling 5-hour window and one per week — spent per /ask (/askwise costs the multiplier times more). A request is allowed while both have budget left. Window start times are staggered per user.",
    ru: "У каждого пользователя два бюджета токенов — на скользящее окно 5 часов и на неделю — списываются за /ask (для /askwise — в коэффициент раз больше). Запрос разрешён, пока в обоих окнах есть бюджет. Начала окон сдвинуты у каждого пользователя по-своему.",
  }),
  ui_ratelimit_my_usage: m({
    en: "My Usage",
    ru: "Моё использование",
  }),
  ui_ratelimit_5h_window: m({
    en: "5-hour window",
    ru: "Окно 5 часов",
  }),
  ui_ratelimit_weekly_window: m({
    en: "Weekly window",
    ru: "Недельное окно",
  }),
  ui_ratelimit_resets: m({
    en: "Resets",
    ru: "Сброс",
  }),
  ui_ratelimit_reset: m({
    en: "Reset usage",
    ru: "Сбросить использование",
  }),
  // Web App header (`components/usage-header.tsx`): the viewer's own budget as
  // two progress bars. Percentage-only, exactly like the `/usage` command.
  ui_usage_header_title: m({
    en: "Your limits",
    ru: "Твои лимиты",
  }),
  ui_usage_header_5h: m({
    en: "5 h",
    ru: "5 ч",
  }),
  ui_usage_header_weekly: m({
    en: "7 d",
    ru: "7 дн",
  }),
  ui_usage_header_left: m({
    en: (left: number) => `${left}% left`,
    ru: (left: number) => `осталось ${left}%`,
  }),
  ui_usage_header_resets: m({
    en: (ms: number) => `~${etaEn(ms)} until reset`,
    ru: (ms: number) => `~${etaRu(ms)} до сброса`,
  }),
};
