// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { m } from "./message";

// Budget caps, anomaly thresholds and the spend dashboard.
export const budgetMessages = {
  // Budget settings tab (caps + anomaly thresholds)
  ui_budget_caps_header: m({
    en: "Hard USD caps",
    ru: "Жёсткие потолки в USD",
  }),
  ui_budget_caps_footer: m({
    en: "The monthly cap is your real budget ceiling; the others bound how fast it can drain. The owner is never blocked.",
    ru: "Месячный потолок — твой реальный лимит бюджета; остальные ограничивают скорость его расхода. Владельца никогда не блокирует.",
  }),
  ui_budget_enabled: m({
    en: "Enforce budget caps",
    ru: "Применять лимиты бюджета",
  }),
  ui_budget_owner_exempt: m({
    en: "Exempt owner",
    ru: "Исключить владельца",
  }),
  ui_budget_global_monthly: m({
    en: "Global / month ($)",
    ru: "Глобально / месяц ($)",
  }),
  ui_budget_global_daily: m({
    en: "Global / day ($)",
    ru: "Глобально / день ($)",
  }),
  ui_budget_per_chat_daily: m({
    en: "Per chat / day ($)",
    ru: "На чат / день ($)",
  }),
  ui_budget_new_user_daily: m({
    en: "New user / day ($)",
    ru: "Новый юзер / день ($)",
  }),
  ui_budget_new_user_window: m({
    en: "New-user window (days)",
    ru: "Окно новизны (дни)",
  }),
  ui_budget_anomaly_header: m({
    en: "Spike alerts & digest",
    ru: "Алерты скачков и дайджест",
  }),
  ui_budget_anomaly_footer: m({
    en: "Alert-only — these never block a request. A spike fires on the absolute amount or a jump over the recent baseline.",
    ru: "Только уведомления — не блокируют запрос. Скачок срабатывает по абсолютной сумме или прыжку выше недавнего базового уровня.",
  }),
  ui_budget_digest_interval: m({
    en: "Digest every (hours)",
    ru: "Дайджест каждые (часов)",
  }),
  ui_budget_spike_user_abs: m({
    en: "User spike ($/day)",
    ru: "Скачок юзера ($/день)",
  }),
  ui_budget_spike_chat_abs: m({
    en: "Chat spike ($/day)",
    ru: "Скачок чата ($/день)",
  }),
  ui_budget_spike_velocity: m({
    en: "Velocity (× baseline)",
    ru: "Скорость (× базы)",
  }),
  ui_budget_spike_min_baseline: m({
    en: "Min baseline ($)",
    ru: "Мин. база ($)",
  }),
  // Spend dashboard tab
  ui_spend_global_header: m({
    en: "Total spend (everyone)",
    ru: "Всего трат (все)",
  }),
  ui_spend_top_users: m({
    en: "Top spenders — users",
    ru: "Топ по тратам — юзеры",
  }),
  ui_spend_top_chats: m({
    en: "Top spenders — chats",
    ru: "Топ по тратам — чаты",
  }),
  ui_spend_models: m({
    en: "By model",
    ru: "По моделям",
  }),
  ui_spend_denials: m({
    en: "Most-denied users (today)",
    ru: "Чаще всего отклонялись (сегодня)",
  }),
  ui_spend_new_users: m({
    en: "New users (7 days)",
    ru: "Новые юзеры (7 дней)",
  }),
  ui_spend_new_chats: m({
    en: "New chats (7 days)",
    ru: "Новые чаты (7 дней)",
  }),
  ui_spend_unpriced: m({
    en: "no cost reported",
    ru: "нет данных о стоимости",
  }),
  ui_spend_empty: m({
    en: "Nothing yet.",
    ru: "Пока пусто.",
  }),
  ui_spending_title: m({
    en: "Spending",
    ru: "Расходы",
  }),
  ui_spending_day: m({
    en: "Today",
    ru: "Сегодня",
  }),
  ui_spending_week: m({
    en: "Last 7 days",
    ru: "За 7 дней",
  }),
  ui_spending_month: m({
    en: "Last 30 days",
    ru: "За 30 дней",
  }),
  ui_spending_month_short: m({
    en: (amount: string) => `30d: ${amount}`,
    ru: (amount: string) => `30д: ${amount}`,
  }),
  ui_spending_footer: m({
    en: "Money spent on AI requests, in USD — OpenRouter's own reported cost; models it reported no cost for are listed as under-counted. Periods are trailing windows by UTC date.",
    ru: "Деньги, потраченные на запросы к ИИ, в USD: стоимость, которую сообщил OpenRouter; модели, по которым он её не сообщил, помечаются как занижающие траты. Периоды — скользящие окна по датам UTC.",
  }),
};
