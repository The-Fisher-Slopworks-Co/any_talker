// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { UserSettingChange, UserSettingField, WindowKind } from "../types";
import { etaEn, etaRu } from "./eta";
import { m } from "./message";

type ReminderTimeParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  timezone: string;
};

// Zero-pad a number to two digits (shared by the reminder time formatters).
const pad2 = (n: number) => n.toString().padStart(2, "0");

// a 5-hour-window wait reads in minutes/hours, a weekly one in hours/days.
// Render a `settings_updated` confirmation line. Each change shows the field
// label and the new value; gender/language are de-coded to a readable word, and
// a cleared field (value === null) reads as "reset to default".
const SETTING_LABEL_EN: Record<UserSettingField, string> = {
  name: "name",
  timezone: "timezone",
  gender: "gender",
  language: "language",
};

function settingValueEn(change: UserSettingChange): string {
  if (change.value === null) return "reset to default";
  if (change.field === "gender") {
    return change.value === "male" ? "male" : "female";
  }
  if (change.field === "language") {
    return change.value === "ru" ? "Russian" : "English";
  }
  return change.value;
}

function settingsUpdatedEn(changes: UserSettingChange[]): string {
  const parts = changes.map(
    (c) => `${SETTING_LABEL_EN[c.field]}: ${settingValueEn(c)}`,
  );
  return `Settings updated — ${parts.join(", ")}`;
}

const SETTING_LABEL_RU: Record<UserSettingField, string> = {
  name: "имя",
  timezone: "часовой пояс",
  gender: "пол",
  language: "язык",
};

function settingValueRu(change: UserSettingChange): string {
  if (change.value === null) return "сброшено";
  if (change.field === "gender") {
    return change.value === "male" ? "мужской" : "женский";
  }
  if (change.field === "language") {
    return change.value === "ru" ? "русский" : "английский";
  }
  return change.value;
}

function settingsUpdatedRu(changes: UserSettingChange[]): string {
  const parts = changes.map(
    (c) => `${SETTING_LABEL_RU[c.field]}: ${settingValueRu(c)}`,
  );
  return `Настройки обновлены — ${parts.join(", ")}`;
}

// Messages the bot itself sends over Telegram.
export const botMessages = {
  bot_photo_cant_fetch: m({
    en: "⚠️ Couldn't fetch the attached photo.",
    ru: "⚠️ Не удалось загрузить прикреплённое фото.",
  }),
  bot_voice_cant_fetch: m({
    en: "⚠️ Couldn't fetch the voice message.",
    ru: "⚠️ Не удалось загрузить голосовое сообщение.",
  }),
  bot_video_cant_fetch: m({
    en: "⚠️ Couldn't process the attached video.",
    ru: "⚠️ Не удалось обработать прикреплённое видео.",
  }),
  // A clip over Telegram's getFile ceiling can't be downloaded at all, so the
  // user is told the actual limit rather than a generic failure.
  bot_video_too_large: m({
    en: (maxMb: number) =>
      `⚠️ The video is too large — Telegram only lets bots download files up to ${maxMb} MB.`,
    ru: (maxMb: number) =>
      `⚠️ Видео слишком большое — Telegram разрешает ботам скачивать файлы не больше ${maxMb} МБ.`,
  }),
  // Same idea for the duration cap: name the limit so the user can trim and
  // resend rather than guess why nothing happened.
  bot_video_too_long: m({
    en: (maxSeconds: number) =>
      `⚠️ The video is too long — I take clips up to ${maxSeconds} seconds.`,
    ru: (maxSeconds: number) =>
      `⚠️ Видео слишком длинное — принимаю ролики не длиннее ${maxSeconds} секунд.`,
  }),
  bot_ask_usage: m({
    en: "Usage: /ask <text> (short), /askwise <text> (detailed) — or reply to a message with either.",
    ru: "Использование: /ask <текст> (коротко), /askwise <текст> (подробно) — или ответь на сообщение любой из этих команд.",
  }),
  bot_rate_limited: m({
    en: (limitedBy: WindowKind, ms: number) =>
      limitedBy === "weekly"
        ? `Weekly token limit reached. Resets in ~${etaEn(ms)}.`
        : `5-hour token limit reached. Resets in ~${etaEn(ms)}.`,
    ru: (limitedBy: WindowKind, ms: number) =>
      limitedBy === "weekly"
        ? `Недельный лимит токенов исчерпан. Восстановится примерно через ${etaRu(ms)}.`
        : `Лимит токенов за 5 часов исчерпан. Восстановится примерно через ${etaRu(ms)}.`,
  }),
  // Shown to a user denied by a hard USD budget cap. Deliberately generic — it
  // never leaks the financial/operational detail (which cap, how much) to a
  // stranger now that the whitelist is gone.
  bot_budget_limited: m({
    en: "⚠️ The bot is at capacity right now. Please try again later.",
    ru: "⚠️ Бот сейчас перегружен. Попробуй позже.",
  }),
  // Owner DM when a GLOBAL budget cap trips (the kill-switch). `period` is the
  // window that filled; `spentUsd` is the pre-formatted amount.
  bot_owner_budget_cap: m({
    en: (period: "day" | "month", spent: string) =>
      `🛑 Global ${period === "month" ? "monthly" : "daily"} budget cap reached ($${spent} spent). Non-owner requests are blocked until it resets.`,
    ru: (period: "day" | "month", spent: string) =>
      `🛑 Достигнут глобальный лимит бюджета (за ${period === "month" ? "месяц" : "день"}): потрачено $${spent}. Запросы не-владельцев заблокированы до сброса.`,
  }),
  // Owner DM when the bot is added to a new group chat.
  bot_owner_new_group: m({
    en: (title: string, chatId: string) =>
      `👥 Added to a new group: ${title} (${chatId}).`,
    ru: (title: string, chatId: string) =>
      `👥 Бота добавили в новый чат: ${title} (${chatId}).`,
  }),
  // Owner DM when a user's/chat's spend today spikes (absolute or velocity).
  bot_owner_spike: m({
    en: (
      scope: "user" | "chat",
      label: string,
      today: string,
      baseline: string,
    ) =>
      `📈 Spend spike (${scope}): ${label} spent ${today} today (baseline ~${baseline}/day).`,
    ru: (
      scope: "user" | "chat",
      label: string,
      today: string,
      baseline: string,
    ) =>
      `📈 Скачок трат (${scope === "user" ? "юзер" : "чат"}): ${label} потратил ${today} за сегодня (базовый уровень ~${baseline}/день).`,
  }),
  // Periodic owner digest (plain text). Section headers are keys; the rows
  // (labels + amounts) are data composed in `observability/digest.ts`.
  bot_digest_header: m({
    en: "📊 Budget digest",
    ru: "📊 Сводка по бюджету",
  }),
  bot_digest_spend: m({
    en: (day: string, week: string, month: string) =>
      `Spend — today ${day} · 7d ${week} · 30d ${month}`,
    ru: (day: string, week: string, month: string) =>
      `Траты — сегодня ${day} · 7д ${week} · 30д ${month}`,
  }),
  bot_digest_new_users: m({
    en: (n: number) => `🆕 New users: ${n}`,
    ru: (n: number) => `🆕 Новых юзеров: ${n}`,
  }),
  bot_digest_new_chats: m({
    en: (n: number) => `🆕 New chats: ${n}`,
    ru: (n: number) => `🆕 Новых чатов: ${n}`,
  }),
  bot_digest_top_users: m({
    en: "Top spenders (users)",
    ru: "Топ по тратам (юзеры)",
  }),
  bot_digest_top_chats: m({
    en: "Top spenders (group chats)",
    ru: "Топ по тратам (групповые чаты)",
  }),
  bot_digest_top_models: m({
    en: "By model",
    ru: "По моделям",
  }),
  bot_digest_denials: m({
    en: "Most-denied users",
    ru: "Чаще всего отклонялись",
  }),
  bot_digest_unpriced: m({
    en: (models: string) =>
      `⚠️ Models with no cost reported (spend under-counted): ${models}`,
    ru: (models: string) =>
      `⚠️ Модели без данных о стоимости (траты занижены): ${models}`,
  }),
  // Column headers for the digest's Rich Markdown tables.
  bot_digest_col_user: m({
    en: "User",
    ru: "Юзер",
  }),
  bot_digest_col_chat: m({
    en: "Chat",
    ru: "Чат",
  }),
  bot_digest_col_model: m({
    en: "Model",
    ru: "Модель",
  }),
  bot_digest_col_month: m({
    en: "30d",
    ru: "30д",
  }),
  bot_digest_col_week: m({
    en: "7d",
    ru: "7д",
  }),
  bot_digest_col_today: m({
    en: "Today",
    ru: "Сегодня",
  }),
  bot_digest_col_denials: m({
    en: "Denials",
    ru: "Отказов",
  }),
  // Reply to `/digest` when the period held nothing worth reporting (the
  // scheduled digest simply stays silent in that case).
  bot_digest_empty: m({
    en: "Nothing to report — no spend, new users or denials yet.",
    ru: "Пока не о чем отчитываться — ни трат, ни новых юзеров, ни отказов.",
  }),
  // `/usage` (DM only): a header, then two lines per rate-limit window — the
  // window and the share of its budget already spent, then how long until it
  // comes back. Deliberately
  // percentage-only: the raw token counts are operational detail and never
  // leave the admin surfaces (see `ratelimit/share.ts`).
  // The header carries the meaning of the bare percentage below it ("of your
  // limit, spent"), so each window line doesn't have to repeat it.
  bot_usage_header: m({
    en: "📊 Limit used",
    ru: "📊 Израсходовано лимита",
  }),
  bot_usage_line: m({
    en: (window: WindowKind, used: number) =>
      `${window === "weekly" ? "Week" : "5 hours"}: ${used}%`,
    ru: (window: WindowKind, used: number) =>
      `${window === "weekly" ? "Неделя" : "5 часов"}: ${used}%`,
  }),
  bot_usage_reset: m({
    en: (ms: number) => `~${etaEn(ms)} until reset`,
    ru: (ms: number) => `~${etaRu(ms)} до сброса`,
  }),
  // Shown instead of the bars when the viewer is the (exempt) owner: their
  // usage is never accrued, so a 0% bar would be meaningless rather than true.
  bot_usage_exempt: m({
    en: "The limits don't apply to you.",
    ru: "На тебя лимиты не распространяются.",
  }),
  bot_ai_error: m({
    en: "⚠️ AI error. Try again later.",
    ru: "⚠️ Ошибка ИИ. Попробуй позже.",
  }),
  bot_details_summary: m({
    en: "Expand reply",
    ru: "Развернуть ответ",
  }),
  bot_contact_no_user_id: m({
    en: "This contact isn't on Telegram — nothing to whitelist.",
    ru: "Этот контакт не зарегистрирован в Telegram — добавлять в белый список нечего.",
  }),
  bot_contact_is_owner: m({
    en: "You're already the owner — no whitelist entry needed.",
    ru: "Ты уже владелец бота — запись в белом списке не нужна.",
  }),
  bot_contact_already_whitelisted: m({
    en: (label: string) => `${label} is already whitelisted.`,
    ru: (label: string) => `${label} уже в белом списке.`,
  }),
  bot_contact_added: m({
    en: (label: string) => `Added ${label} to the whitelist.`,
    ru: (label: string) => `${label} добавлен(а) в белый список.`,
  }),
  bot_check_wrong_user: m({
    en: "This check isn't addressed to you.",
    ru: "Этот вопрос адресован не тебе.",
  }),
  bot_reminder_scheduled: m({
    en: (p: ReminderTimeParts) => {
      return `Reminder set for ${p.year}-${pad2(p.month)}-${pad2(p.day)} at ${pad2(p.hour)}:${pad2(p.minute)} (${p.timezone})`;
    },
    ru: (p: ReminderTimeParts) => {
      return `Было создано напоминание на ${pad2(p.day)}.${pad2(p.month)}.${p.year} в ${pad2(p.hour)}:${pad2(p.minute)} (${p.timezone})`;
    },
  }),
  bot_reminder_updated: m({
    en: (p: ReminderTimeParts) => {
      return `Reminder updated for ${p.year}-${pad2(p.month)}-${pad2(p.day)} at ${pad2(p.hour)}:${pad2(p.minute)} (${p.timezone})`;
    },
    ru: (p: ReminderTimeParts) => {
      return `Напоминание обновлено на ${pad2(p.day)}.${pad2(p.month)}.${p.year} в ${pad2(p.hour)}:${pad2(p.minute)} (${p.timezone})`;
    },
  }),
  bot_reminder_cancelled: m({
    en: (p: ReminderTimeParts) => {
      return `Reminder cancelled for ${p.year}-${pad2(p.month)}-${pad2(p.day)} at ${pad2(p.hour)}:${pad2(p.minute)} (${p.timezone})`;
    },
    ru: (p: ReminderTimeParts) => {
      return `Напоминание на ${pad2(p.day)}.${pad2(p.month)}.${p.year} в ${pad2(p.hour)}:${pad2(p.minute)} (${p.timezone}) отменено`;
    },
  }),
  bot_settings_updated: m({
    en: settingsUpdatedEn,
    ru: settingsUpdatedRu,
  }),
  bot_managed_bot_created: m({
    en: (username: string) => `✅ Managed bot @${username} is now running.`,
    ru: (username: string) => `✅ Управляемый бот @${username} запущен.`,
  }),
};
