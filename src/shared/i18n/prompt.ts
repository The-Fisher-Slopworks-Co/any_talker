// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { m } from "./message";

// The global system prompt, the model chain and provider routing.
export const promptMessages = {
  ui_prompt_models: m({
    en: "Models",
    ru: "Модели",
  }),
  ui_prompt_system_prompt: m({
    en: "System Prompt",
    ru: "Системный промпт",
  }),
  ui_prompt_optimize_copy: m({
    en: "Copy for optimization",
    ru: "Скопировать для оптимизации",
  }),
  ui_prompt_optimize_copied: m({
    en: "Copied",
    ru: "Скопировано",
  }),
  ui_prompt_optimize_footer: m({
    en: "Copies a request with both prompts. Paste it into any chat, then paste the shortened prompt back and save.",
    ru: "Копирует запрос с обоими промптами. Вставьте в любой чат, затем верните сокращённый промпт и сохраните.",
  }),
  ui_prompt_optimize_failed: m({
    en: "Could not copy to the clipboard.",
    ru: "Не удалось скопировать в буфер обмена.",
  }),
  ui_prompt_placeholder: m({
    en: "Describe how the bot should behave",
    ru: "Опиши, как должен вести себя бот",
  }),
  ui_prompt_timezone_footer: m({
    en: "The timezone applies when a chat or user has none set. 0 chars collapses every reply.",
    ru: "Часовой пояс действует, если у чата или пользователя нет своего. 0 символов сворачивает каждый ответ.",
  }),
  ui_prompt_expandable_threshold: m({
    en: "Collapse Replies Over",
    ru: "Сворачивать ответы длиннее",
  }),
  // Footer for the fallback-chain field.
  ui_prompt_provider_routing: m({
    en: "Routing",
    ru: "Маршрутизация",
  }),
  ui_prompt_provider_routing_footer: m({
    en: "Pinning a provider disables fallback. Not every model supports every thinking level.",
    ru: "Закреплённый провайдер отключает резервные модели. Не все модели поддерживают все уровни размышлений.",
  }),
  ui_prompt_service_tier: m({
    en: "Service Tier",
    ru: "Тариф обслуживания",
  }),
  ui_models_model_id: m({
    en: "Model ID",
    ru: "ID модели",
  }),
  ui_models_not_in_catalog: m({
    en: "This model isn’t in OpenRouter’s model list.",
    ru: "Этой модели нет в списке моделей OpenRouter.",
  }),
  ui_models_fallback_n: m({
    en: (n: number) => `#${n}`,
    ru: (n: number) => `#${n}`,
  }),
  ui_models_remove_fallback: m({
    en: "Remove fallback",
    ru: "Удалить запасную",
  }),
  ui_models_add_fallback: m({
    en: "Add fallback",
    ru: "Добавить запасную",
  }),
  ui_sort_label: m({
    en: "Sort Providers By",
    ru: "Сортировка провайдеров",
  }),
  ui_prompt_chars_suffix: m({
    en: "chars",
    ru: "симв.",
  }),
  ui_sort_default: m({
    en: "Auto",
    ru: "Авто",
  }),
  ui_sort_price: m({
    en: "Price",
    ru: "Цена",
  }),
  ui_sort_throughput: m({
    en: "Throughput",
    ru: "Скорость",
  }),
  ui_sort_latency: m({
    en: "Latency",
    ru: "Задержка",
  }),
  ui_provider_label: m({
    en: "Provider",
    ru: "Провайдер",
  }),
  ui_provider_auto: m({
    en: "Auto",
    ru: "Авто",
  }),
  ui_provider_loading: m({
    en: "Loading providers…",
    ru: "Загрузка провайдеров…",
  }),
  ui_prompt_reasoning_effort: m({
    en: "Thinking Level",
    ru: "Уровень размышлений",
  }),
  ui_effort_default: m({
    en: "Default",
    ru: "По умолчанию",
  }),
  ui_effort_none: m({
    en: "None (off)",
    ru: "Нет (выключено)",
  }),
  ui_effort_minimal: m({
    en: "Minimal",
    ru: "Минимальный",
  }),
  ui_effort_low: m({
    en: "Low",
    ru: "Низкий",
  }),
  ui_effort_medium: m({
    en: "Medium",
    ru: "Средний",
  }),
  ui_effort_high: m({
    en: "High",
    ru: "Высокий",
  }),
  ui_effort_xhigh: m({
    en: "Extra high",
    ru: "Очень высокий",
  }),
  ui_effort_max: m({
    en: "Max",
    ru: "Максимальный",
  }),
  ui_tier_default: m({
    en: "Default",
    ru: "По умолчанию",
  }),
  ui_tier_flex: m({
    en: "Flex",
    ru: "Flex",
  }),
  ui_tier_priority: m({
    en: "Priority",
    ru: "Priority",
  }),
  ui_modelinfo_loading: m({
    en: "Loading model info…",
    ru: "Загрузка информации о модели…",
  }),
  ui_modelinfo_input: m({
    en: "Input",
    ru: "Ввод",
  }),
  ui_modelinfo_output: m({
    en: "Output",
    ru: "Вывод",
  }),
  ui_modelinfo_image: m({
    en: "Image",
    ru: "Изображение",
  }),
  ui_modelinfo_modalities: m({
    en: "Modalities",
    ru: "Модальности",
  }),
  ui_modelinfo_tools: m({
    en: "Tools",
    ru: "Инструменты",
  }),
  ui_modelinfo_caching: m({
    en: "Caching",
    ru: "Кэширование",
  }),
  ui_modelinfo_resolving_provider: m({
    en: "Resolving provider…",
    ru: "Определяем провайдера…",
  }),
  ui_modelinfo_no_provider_data: m({
    en: (sort: string) =>
      `No provider data for sort=${sort}; showing catalogue values.`,
    ru: (sort: string) =>
      `Нет данных провайдера для sort=${sort}; значения каталога.`,
  }),
  ui_modelinfo_provider_prefix: m({
    en: "Provider: ",
    ru: "Провайдер: ",
  }),
  ui_modelinfo_tokps: m({
    en: "tok/s",
    ru: "ток/с",
  }),
  ui_modelinfo_ms: m({
    en: "ms",
    ru: "мс",
  }),
};
