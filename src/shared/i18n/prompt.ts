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
  ui_prompt_system_prompt_footer: m({
    en: "Character description embedded into the system instruction.",
    ru: "Описание персонажа, встраиваемое в системную инструкцию.",
  }),
  ui_prompt_placeholder: m({
    en: "Describe how the bot should behave",
    ru: "Опиши, как должен вести себя бот",
  }),
  ui_prompt_timezone: m({
    en: "Timezone",
    ru: "Часовой пояс",
  }),
  ui_prompt_timezone_footer: m({
    en: "Default timezone used when the chat or user has no override.",
    ru: "Часовой пояс по умолчанию, когда у чата или пользователя нет своего.",
  }),
  ui_prompt_expandable_threshold: m({
    en: "Collapse threshold",
    ru: "Порог сворачивания",
  }),
  ui_prompt_expandable_threshold_footer: m({
    en: "Replies longer than this many characters are hidden under an expandable quote. Set to 0 to collapse everything.",
    ru: "Ответы длиннее указанного числа символов прячутся под раскрывающуюся цитату. 0 — сворачивать всегда.",
  }),
  // Footer for the fallback-chain field.
  ui_prompt_models_fallback_footer: m({
    en: "Primary model first; fallbacks are tried in order if it fails.",
    ru: "Сначала основная модель; запасные пробуются по очереди при ошибке.",
  }),
  ui_prompt_provider_routing: m({
    en: "Provider Routing",
    ru: "Маршрутизация провайдеров",
  }),
  ui_prompt_provider_routing_footer: m({
    en: "How the gateway picks a provider for the model. Auto leaves it to the gateway; the others sort by price, throughput, or latency. Pinning a provider overrides the sort and disables fallback.",
    ru: "Как шлюз выбирает провайдера для модели. «Авто» — выбор за шлюзом; остальные сортируют по цене, скорости или задержке. Закрепление провайдера отменяет сортировку и отключает запасные варианты.",
  }),
  ui_prompt_service_tier: m({
    en: "Service Tier",
    ru: "Тариф обслуживания",
  }),
  ui_prompt_service_tier_footer: m({
    en: "Processing tier for requests. Default is standard processing; Flex is cheaper but slower with lower availability; Priority is faster at a higher cost.",
    ru: "Тариф обработки запросов. «По умолчанию» — стандартная обработка; Flex дешевле, но медленнее и менее доступен; Priority быстрее, но дороже.",
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
    en: "Auto (use sort)",
    ru: "Авто (по сортировке)",
  }),
  ui_provider_loading: m({
    en: "Loading providers…",
    ru: "Загрузка провайдеров…",
  }),
  ui_prompt_reasoning_effort: m({
    en: "Thinking Level",
    ru: "Уровень размышлений",
  }),
  ui_prompt_reasoning_effort_footer: m({
    en: "How much reasoning the model spends before answering /ask and /askwise. Default sends no level and leaves it to the model; None disables reasoning; higher levels think longer and cost more. Not every model supports every level — the gateway may reject an unsupported one.",
    ru: "Сколько модель размышляет перед ответом на /ask и /askwise. «По умолчанию» не задаёт уровень — выбор за моделью; «Нет» выключает размышления; чем выше уровень, тем дольше и дороже. Не каждая модель поддерживает все уровни — шлюз может отклонить неподдерживаемый.",
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
  ui_effort_short: m({
    en: "/ask (short)",
    ru: "/ask (коротко)",
  }),
  ui_effort_wise: m({
    en: "/askwise (detailed)",
    ru: "/askwise (подробно)",
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
      `Нет данных провайдера для сортировки sort=${sort}; показаны значения каталога.`,
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
