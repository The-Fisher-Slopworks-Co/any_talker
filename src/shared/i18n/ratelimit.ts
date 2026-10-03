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
  ui_ratelimit_5h_usd: m({
    en: "5-hour limit ($)",
    ru: "Лимит за 5 часов ($)",
  }),
  ui_ratelimit_weekly_usd: m({
    en: "Weekly limit ($)",
    ru: "Недельный лимит ($)",
  }),
  ui_ratelimit_owner_exempt: m({
    en: "Owner exempt",
    ru: "Владелец без лимита",
  }),
  ui_ratelimit_footer: m({
    en: "Per-user spend budgets; a request needs both to have budget left.",
    ru: "Бюджеты трат пользователя; запросу нужен остаток в обоих.",
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
  ui_usage_header_boost: m({
    en: (percent: number, until: string) =>
      `Promo: +${percent}% to limits until ${until}`,
    ru: (percent: number, until: string) =>
      `Акция: +${percent}% к лимитам до ${until}`,
  }),
  // Admin "+X% to limits until <date>" promo (`components/limit-boost-card.tsx`).
  ui_boost_header: m({
    en: "Limit promo",
    ru: "Акция на лимиты",
  }),
  ui_boost_percent: m({
    en: "Bonus, %",
    ru: "Бонус, %",
  }),
  ui_boost_until: m({
    en: "Until",
    ru: "До",
  }),
  ui_boost_until_invalid: m({
    en: "Pick a date in the future.",
    ru: "Выбери дату в будущем.",
  }),
  ui_boost_start: m({
    en: "Start promo",
    ru: "Запустить акцию",
  }),
  ui_boost_end: m({
    en: "End promo now",
    ru: "Завершить акцию сейчас",
  }),
  ui_boost_active: m({
    en: (percent: number, until: string) => `+${percent}% until ${until}`,
    ru: (percent: number, until: string) => `+${percent}% до ${until}`,
  }),
  ui_boost_footer: m({
    en: "Raises both limits for everyone until the end date. Users see it.",
    ru: "Повышает оба лимита для всех до даты окончания. Пользователи её видят.",
  }),
  // Admin-assigned limit classes: their config here, the assignment on the
  // user's page. Admin-only; users are never shown their class.
  ui_limit_classes_header: m({
    en: "Limit classes",
    ru: "Классы лимитов",
  }),
  ui_limit_class_header: m({
    en: "Limit class",
    ru: "Класс лимитов",
  }),
  ui_limit_class_name: m({
    en: (n: number) => `Level ${n}`,
    ru: (n: number) => `Уровень ${n}`,
  }),
  ui_limit_class_none: m({
    en: "None",
    ru: "Нет",
  }),
  ui_limit_class_multiplier: m({
    en: "Limit multiplier",
    ru: "Множитель лимитов",
  }),
  ui_limit_class_reminders: m({
    en: "Reminder cap",
    ru: "Лимит напоминаний",
  }),
  ui_limit_class_allowance: m({
    en: "Monthly allowance, $",
    ru: "Запас на месяц, $",
  }),
  ui_limit_class_allowance_spent: m({
    en: "Allowance used this month",
    ru: "Потрачено из запаса за месяц",
  }),
  ui_limit_classes_footer: m({
    en: "Set on the user's page. Overflow past regular limits comes from the monthly allowance.",
    ru: "Назначается на странице пользователя. Сверх обычных лимитов расходуется месячный запас.",
  }),
  ui_limit_class_footer: m({
    en: "Applies the class settings from Limits. Not shown to the user.",
    ru: "Применяет настройки класса с вкладки лимитов. Пользователю не показывается.",
  }),
  ui_usage_header_exempt: m({
    en: "No limits apply to you.",
    ru: "На тебя лимиты не распространяются.",
  }),
};
