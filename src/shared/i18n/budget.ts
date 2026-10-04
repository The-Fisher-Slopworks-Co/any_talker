// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { m } from "./message";

// Budget caps, anomaly thresholds and the spend dashboard.
export const budgetMessages = {
  // Budget settings tab (caps + digest + spike alerts)
  ui_budget_enabled: m({
    en: "Enforce Budget Caps",
    ru: "Применять лимиты бюджета",
  }),
  ui_budget_owner_exempt: m({
    en: "Exempt Owner",
    ru: "Исключить владельца",
  }),
  ui_budget_caps_header: m({
    en: "Hard Caps",
    ru: "Жёсткие лимиты",
  }),
  ui_budget_caps_footer: m({
    en: "Monthly is the real ceiling; the others limit burn rate.",
    ru: "Месячный — реальный потолок, остальные ограничивают скорость расхода.",
  }),
  ui_budget_global_monthly: m({
    en: "Global per Month",
    ru: "Всего за месяц",
  }),
  ui_budget_global_daily: m({
    en: "Global per Day",
    ru: "Всего за день",
  }),
  ui_budget_per_chat_daily: m({
    en: "Per Chat per Day",
    ru: "На чат за день",
  }),
  ui_budget_new_user_daily: m({
    en: "New User per Day",
    ru: "Новый юзер за день",
  }),
  ui_budget_new_user_window: m({
    en: "New-User Window",
    ru: "Окно новизны",
  }),
  ui_budget_digest_header: m({
    en: "Digest",
    ru: "Дайджест",
  }),
  ui_budget_digest_enabled: m({
    en: "Regular Digest",
    ru: "Регулярный дайджест",
  }),
  ui_budget_digest_interval: m({
    en: "Send Every",
    ru: "Отправлять каждые",
  }),
  ui_budget_anomaly_header: m({
    en: "Spike Alerts",
    ru: "Всплески расходов",
  }),
  ui_budget_anomaly_footer: m({
    en: "Alerts only, never block requests.",
    ru: "Только уведомления, запросы не блокируются.",
  }),
  ui_budget_spike_user_abs: m({
    en: "User Spike",
    ru: "Всплеск юзера",
  }),
  ui_budget_spike_chat_abs: m({
    en: "Chat Spike",
    ru: "Всплеск чата",
  }),
  ui_budget_spike_velocity: m({
    en: "Velocity",
    ru: "Скорость",
  }),
  ui_budget_spike_min_baseline: m({
    en: "Min Baseline",
    ru: "Мин. база",
  }),
  // Units shown beside the numbers; a word unit gets a space, a symbol hugs.
  ui_budget_unit_days: m({ en: "days", ru: "дн." }),
  ui_budget_unit_hours: m({ en: "h", ru: "ч" }),
  ui_budget_unit_per_day: m({ en: "/day", ru: "/день" }),
  ui_budget_unit_baseline: m({ en: "× baseline", ru: "× базы" }),
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
    en: "OpenRouter-reported USD; models without cost data are under-counted. UTC windows.",
    ru: "USD по данным OpenRouter; модели без данных о стоимости занижают сумму. Окна по UTC.",
  }),
};
