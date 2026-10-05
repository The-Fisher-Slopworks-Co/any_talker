// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { m } from "./message";

// Group chats: the admin list and a chat's per-chat overrides.
export const chatsMessages = {
  ui_chats_empty: m({
    en: "No chats yet.",
    ru: "Чатов пока нет.",
  }),
  ui_chat_private: m({
    en: "Private chat",
    ru: "Приватный чат",
  }),
  ui_chat_type_private: m({
    en: "Private",
    ru: "Приватный",
  }),
  ui_chat_type_group: m({
    en: "Group",
    ru: "Группа",
  }),
  ui_chat_type_supergroup: m({
    en: "Supergroup",
    ru: "Супергруппа",
  }),
  ui_chat_type_channel: m({
    en: "Channel",
    ru: "Канал",
  }),
  ui_chat_access_allowed: m({
    en: "Allowed",
    ru: "Разрешён",
  }),
  ui_chat_access_blocked: m({
    en: "Blocked",
    ru: "Заблокирован",
  }),
  ui_chat_not_found: m({
    en: "Chat not found.",
    ru: "Чат не найден.",
  }),
  ui_chat_chat: m({
    en: "Chat",
    ru: "Чат",
  }),
  ui_chat_id: m({
    en: "ID",
    ru: "ID",
  }),
  ui_chat_last_seen: m({
    en: "Last Seen",
    ru: "Последний раз",
  }),
  ui_chat_bot_name: m({
    en: "Bot Name",
    ru: "Имя бота",
  }),
  ui_chat_bot_name_placeholder: m({
    en: "Off",
    ru: "Выкл.",
  }),
  ui_chat_bot_name_footer: m({
    en: "Bold prefix on every AI reply. Leave empty to turn it off.",
    ru: "Жирный префикс в каждом ответе ИИ. Пусто — выключено.",
  }),
  ui_chat_system_prompt: m({
    en: "Own System Prompt",
    ru: "Свой системный промпт",
  }),
  ui_chat_system_prompt_off_footer: m({
    en: (chars: number) => `Global (${chars} chars).`,
    ru: (chars: number) => `Глобальный (${chars} симв.).`,
  }),
  ui_chat_models: m({
    en: "Own Models",
    ru: "Свои модели",
  }),
  // Footer for the per-chat fallback-chain field.
  ui_chat_models_off_footer: m({
    en: (list: string) => `Global: ${list}`,
    ru: (list: string) => `Глобально: ${list}`,
  }),
  ui_chat_ai_header: m({
    en: "AI Settings",
    ru: "Настройки ИИ",
  }),
  ui_chat_ai_footer: m({
    en: "A chat timezone applies unless the user sets their own. Pinning a provider disables fallback.",
    ru: "Часовой пояс чата действует, если у пользователя нет своего. Закреплённый провайдер отключает резервные модели.",
  }),
  ui_chat_global_option: m({
    en: (value: string) => `Global (${value})`,
    ru: (value: string) => `Общее (${value})`,
  }),
  ui_chat_prompt_placeholder: m({
    en: "How the bot should behave here",
    ru: "Как боту вести себя в этом чате",
  }),
  ui_chat_keyword_filter: m({
    en: "Keyword Filter",
    ru: "Фильтр по ключевым словам",
  }),
  ui_chat_keyword_filter_placeholder: m({
    en: "word1, word2, word3",
    ru: "слово1, слово2, слово3",
  }),
  ui_chat_keyword_filter_footer: m({
    en: "Comma-separated. Messages containing any (case-insensitive) are deleted.",
    ru: "Через запятую. Сообщения с любым из слов (без учёта регистра) удаляются.",
  }),
};
