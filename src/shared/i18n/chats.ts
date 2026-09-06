// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { m } from "./message";

// Group chats: the admin list and a chat's per-chat overrides.
export const chatsMessages = {
  ui_chats_all: m({
    en: "All Chats",
    ru: "Все чаты",
  }),
  ui_chats_empty: m({
    en: "No chats yet — they appear after the first message.",
    ru: "Чатов пока нет — они появятся после первого сообщения.",
  }),
  ui_chats_footer: m({
    en: "Per-chat overrides apply on top of the global Prompt / Limits / Models.",
    ru: "Переопределения чата применяются поверх глобальных Промпта / Лимитов / Моделей.",
  }),
  ui_chat_private: m({
    en: "Private chat",
    ru: "Приватный чат",
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
    en: "When set, every AI reply in this chat starts with the name in bold.",
    ru: "Если задано, каждый ответ ИИ в этом чате начинается с имени жирным.",
  }),
  ui_chat_override_global: m({
    en: "Override global",
    ru: "Переопределить глобально",
  }),
  ui_chat_system_prompt: m({
    en: "System Prompt",
    ru: "Системный промпт",
  }),
  ui_chat_system_prompt_on_footer: m({
    en: "Character description for this chat.",
    ru: "Описание персонажа для этого чата.",
  }),
  ui_chat_system_prompt_off_footer: m({
    en: (chars: number) => `Using global character (${chars} chars).`,
    ru: (chars: number) => `Используется глобальный персонаж (${chars} симв.).`,
  }),
  ui_chat_models: m({
    en: "Models",
    ru: "Модели",
  }),
  // Footer for the per-chat fallback-chain field.
  ui_chat_models_fallback_footer: m({
    en: "Models used for this chat — primary first; fallbacks are tried in order if it fails.",
    ru: "Модели для этого чата: сначала основная, запасные пробуются по очереди при ошибке.",
  }),
  ui_chat_models_off_footer: m({
    en: (list: string) => `Using global: ${list}`,
    ru: (list: string) => `Используется глобально: ${list}`,
  }),
  ui_chat_provider_routing: m({
    en: "Provider Routing",
    ru: "Маршрутизация провайдеров",
  }),
  ui_chat_provider_routing_on_footer: m({
    en: "How the gateway picks a provider for the model in this chat.",
    ru: "Как шлюз выбирает провайдера для модели в этом чате.",
  }),
  ui_chat_provider_routing_off_footer: m({
    en: (sort: string) => `Using global routing (${sort}).`,
    ru: (sort: string) => `Используется глобальная маршрутизация (${sort}).`,
  }),
  ui_chat_provider: m({
    en: "Specific Provider",
    ru: "Конкретный провайдер",
  }),
  ui_chat_provider_on_footer: m({
    en: "Pin requests in this chat to one provider (no fallback), overriding the sort.",
    ru: "Закрепить запросы этого чата за одним провайдером (без запасных), игнорируя сортировку.",
  }),
  ui_chat_provider_off_footer: m({
    en: (provider: string) => `Using global provider (${provider}).`,
    ru: (provider: string) =>
      `Используется глобальный провайдер (${provider}).`,
  }),
  ui_chat_service_tier: m({
    en: "Service Tier",
    ru: "Тариф обслуживания",
  }),
  ui_chat_service_tier_on_footer: m({
    en: "Processing tier for requests in this chat.",
    ru: "Тариф обработки запросов в этом чате.",
  }),
  ui_chat_service_tier_off_footer: m({
    en: (tier: string) => `Using global tier (${tier}).`,
    ru: (tier: string) => `Используется глобальный тариф (${tier}).`,
  }),
  ui_chat_tz: m({
    en: "Timezone",
    ru: "Часовой пояс",
  }),
  ui_chat_tz_on_footer: m({
    en: "Used unless a user has set their own timezone.",
    ru: "Используется, если у пользователя нет своего пояса.",
  }),
  ui_chat_tz_off_footer: m({
    en: (tz: string) => `Using global timezone (${tz}).`,
    ru: (tz: string) => `Используется глобальный пояс (${tz}).`,
  }),
  ui_chat_prompt_placeholder: m({
    en: "Describe how the bot should behave in this chat",
    ru: "Опиши, как должен вести себя бот в этом чате",
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
    en: "Comma-separated keywords. When enabled, any new message whose text or caption contains one of these substrings (case-insensitive) is deleted by the bot.",
    ru: "Ключевые слова через запятую. Когда включено, новые сообщения, в тексте или подписи которых встречается одна из этих подстрок (без учёта регистра), удаляются ботом.",
  }),
};
