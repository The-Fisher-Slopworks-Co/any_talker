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
  ui_chat_title: m({
    en: "Title",
    ru: "Название",
  }),
  ui_chat_type: m({
    en: "Type",
    ru: "Тип",
  }),
  ui_chat_username: m({
    en: "Username",
    ru: "Username",
  }),
  ui_chat_id: m({
    en: "ID",
    ru: "ID",
  }),
  ui_chat_last_seen: m({
    en: "Last seen",
    ru: "Последний раз",
  }),
  ui_chat_bot_name: m({
    en: "Bot Name",
    ru: "Имя бота",
  }),
  ui_chat_bot_name_placeholder: m({
    en: "Leave empty to disable",
    ru: "Пусто — выключено",
  }),
  ui_chat_bot_name_footer: m({
    en: "Bold prefix on every AI reply.",
    ru: "Жирный префикс в каждом ответе ИИ.",
  }),
  ui_chat_override_global: m({
    en: "Override global",
    ru: "Переопределить глобально",
  }),
  ui_chat_system_prompt: m({
    en: "System Prompt",
    ru: "Системный промпт",
  }),
  ui_chat_system_prompt_off_footer: m({
    en: (chars: number) => `Global (${chars} chars).`,
    ru: (chars: number) => `Глобальный (${chars} симв.).`,
  }),
  ui_chat_models: m({
    en: "Models",
    ru: "Модели",
  }),
  // Footer for the per-chat fallback-chain field.
  ui_chat_models_off_footer: m({
    en: (list: string) => `Global: ${list}`,
    ru: (list: string) => `Глобально: ${list}`,
  }),
  ui_chat_provider_routing: m({
    en: "Provider Routing",
    ru: "Маршрутизация провайдеров",
  }),
  ui_chat_provider_routing_off_footer: m({
    en: (sort: string) => `Global (${sort}).`,
    ru: (sort: string) => `Глобально (${sort}).`,
  }),
  ui_chat_provider: m({
    en: "Specific Provider",
    ru: "Конкретный провайдер",
  }),
  ui_chat_provider_on_footer: m({
    en: "Pinning a provider disables fallback.",
    ru: "Закреплённый провайдер отключает резервные модели.",
  }),
  ui_chat_provider_off_footer: m({
    en: (provider: string) => `Global (${provider}).`,
    ru: (provider: string) => `Глобально (${provider}).`,
  }),
  ui_chat_service_tier: m({
    en: "Service Tier",
    ru: "Тариф обслуживания",
  }),
  ui_chat_service_tier_off_footer: m({
    en: (tier: string) => `Global (${tier}).`,
    ru: (tier: string) => `Глобально (${tier}).`,
  }),
  ui_chat_tz: m({
    en: "Timezone",
    ru: "Часовой пояс",
  }),
  ui_chat_tz_on_footer: m({
    en: "Unless the user sets their own.",
    ru: "Если у пользователя нет своего.",
  }),
  ui_chat_tz_off_footer: m({
    en: (tz: string) => `Global (${tz}).`,
    ru: (tz: string) => `Глобально (${tz}).`,
  }),
  ui_chat_prompt_placeholder: m({
    en: "How the bot should behave here",
    ru: "Как боту вести себя в этом чате",
  }),
  ui_chat_keyword_filter: m({
    en: "Keyword Filter",
    ru: "Фильтр по ключевым словам",
  }),
  ui_chat_keyword_filter_enabled: m({
    en: "Enabled",
    ru: "Включён",
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
