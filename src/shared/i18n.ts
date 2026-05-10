export type Lang = "en" | "ru";

export const SUPPORTED_LANGS: readonly Lang[] = ["en", "ru"];
export const DEFAULT_LANG: Lang = "en";

export function isValidLang(v: unknown): v is Lang {
  return v === "en" || v === "ru";
}

export function normalizeLang(code: string | null | undefined): Lang | null {
  if (typeof code !== "string" || code.length === 0) return null;
  const prefix = code.toLowerCase().split("-")[0]!;
  return (SUPPORTED_LANGS as readonly string[]).includes(prefix)
    ? (prefix as Lang)
    : null;
}

export function resolveLang(
  storedPref: Lang | null,
  telegramCode: string | null | undefined,
): Lang {
  return storedPref ?? normalizeLang(telegramCode) ?? DEFAULT_LANG;
}

type Strings = {
  bot_private: string;
  bot_admin_installed: string;
  bot_admin_menu_label: string;
  bot_photo_cant_fetch: string;
  bot_ask_usage: string;
  bot_rate_limited: (min: number) => string;
  bot_ai_error: string;
  bot_contact_no_user_id: string;
  bot_contact_is_owner: string;
  bot_contact_already_whitelisted: (label: string) => string;
  bot_contact_added: (label: string) => string;

  ui_loading: string;
  ui_saving: string;
  ui_save: string;
  ui_saved: string;
  ui_updating: string;
  ui_open: string;
  ui_remove: string;
  ui_edit: string;
  ui_yes: string;
  ui_no: string;
  ui_dash: string;

  ui_route_settings: string;
  ui_route_admin: string;
  ui_route_user_settings: string;
  ui_route_chat_settings: string;
  ui_route_my_reminders: string;

  ui_admin_prompt: string;
  ui_admin_prompt_desc: string;
  ui_admin_limits: string;
  ui_admin_limits_desc: string;
  ui_admin_whitelist: string;
  ui_admin_whitelist_desc: string;
  ui_admin_users: string;
  ui_admin_users_desc: string;
  ui_admin_chats: string;
  ui_admin_chats_desc: string;
  ui_admin_reminders: string;
  ui_admin_reminders_desc: string;

  ui_main_display_name: string;
  ui_main_name: string;
  ui_main_your_name: string;
  ui_main_name_footer: string;
  ui_main_gender: string;
  ui_main_tell_ai: string;
  ui_main_male: string;
  ui_main_female: string;
  ui_main_gender_footer: string;
  ui_main_timezone: string;
  ui_main_use_my_tz: string;
  ui_main_tz_footer: string;
  ui_main_language: string;
  ui_main_language_footer: string;
  ui_main_lang_english: string;
  ui_main_lang_russian: string;
  ui_main_reminders: string;
  ui_main_my_reminders: string;
  ui_main_bot_config: string;
  ui_main_admin_panel: string;

  ui_whitelist_remove: string;
  ui_whitelist_add: string;
  ui_whitelist_allowed_users: string;
  ui_whitelist_allowed_chats: string;
  ui_whitelist_no_entries: string;
  ui_whitelist_footer_users: string;
  ui_whitelist_footer_chats: string;

  ui_prompt_models: string;
  ui_prompt_models_footer: string;
  ui_prompt_provider_routing: string;
  ui_prompt_provider_routing_footer: string;
  ui_prompt_system_prompt: string;
  ui_prompt_system_prompt_footer: string;
  ui_prompt_placeholder: string;
  ui_prompt_timezone: string;
  ui_prompt_timezone_footer: string;

  ui_sort_default: string;
  ui_sort_price: string;
  ui_sort_throughput: string;
  ui_sort_latency: string;

  ui_models_primary: string;
  ui_models_fallback_n: (n: number) => string;
  ui_models_model_id: string;
  ui_models_remove_fallback: string;
  ui_models_add_fallback: string;

  ui_modelinfo_loading: string;
  ui_modelinfo_unknown: string;
  ui_modelinfo_resolving_provider: string;
  ui_modelinfo_no_provider_data: (sort: string) => string;
  ui_modelinfo_provider_prefix: string;
  ui_modelinfo_tokps: string;
  ui_modelinfo_ms: string;
  ui_modelinfo_input: string;
  ui_modelinfo_output: string;
  ui_modelinfo_image: string;
  ui_modelinfo_modalities: string;
  ui_modelinfo_tools: string;
  ui_modelinfo_caching: string;

  ui_ratelimit_limits: string;
  ui_ratelimit_capacity: string;
  ui_ratelimit_refill_amount: string;
  ui_ratelimit_refill_every: string;
  ui_ratelimit_min_unit: string;
  ui_ratelimit_owner_exempt: string;
  ui_ratelimit_footer: string;
  ui_ratelimit_my_bucket: string;
  ui_ratelimit_tokens: string;
  ui_ratelimit_last_refill: string;
  ui_ratelimit_reset: string;
  ui_ratelimit_no_bucket: string;

  ui_users_all: string;
  ui_users_empty: string;
  ui_users_footer: string;

  ui_user_not_found: string;
  ui_user_profile: string;
  ui_user_name: string;
  ui_user_username: string;
  ui_user_id: string;
  ui_user_last_seen: string;
  ui_user_open_in_tg: string;
  ui_user_display_name_footer: string;

  ui_chats_all: string;
  ui_chats_empty: string;
  ui_chats_footer: string;
  ui_chat_private: string;

  ui_chat_not_found: string;
  ui_chat_chat: string;
  ui_chat_title: string;
  ui_chat_type: string;
  ui_chat_username: string;
  ui_chat_id: string;
  ui_chat_last_seen: string;
  ui_chat_bot_name: string;
  ui_chat_bot_name_placeholder: string;
  ui_chat_bot_name_footer: string;
  ui_chat_override_global: string;
  ui_chat_system_prompt: string;
  ui_chat_system_prompt_on_footer: string;
  ui_chat_system_prompt_off_footer: (chars: number) => string;
  ui_chat_models: string;
  ui_chat_models_on_footer: string;
  ui_chat_models_off_footer: (list: string) => string;
  ui_chat_rate_limit: string;
  ui_chat_rate_limit_on_footer: string;
  ui_chat_rate_limit_off_footer: string;
  ui_chat_tz: string;
  ui_chat_tz_on_footer: string;
  ui_chat_tz_off_footer: (tz: string) => string;
  ui_chat_provider_routing: string;
  ui_chat_provider_routing_on_footer: string;
  ui_chat_provider_routing_off_footer: (sort: string) => string;
  ui_chat_prompt_placeholder: string;

  ui_tz_area: string;
  ui_tz_location: string;

  ui_reminders_upcoming: string;
  ui_reminders_empty_my: string;
  ui_reminders_footer_my: string;
  ui_reminders_admin_header: string;
  ui_reminders_admin_empty: string;
  ui_reminders_admin_footer: string;
  ui_reminders_dm: string;
  ui_reminders_chat_fallback: (id: string) => string;
};

const en: Strings = {
  bot_private: "Hi! This bot is private.",
  bot_admin_installed:
    "Admin panel installed. Tap the menu button to the left of the message input.",
  bot_admin_menu_label: "Admin",
  bot_photo_cant_fetch: "⚠️ Couldn't fetch the attached photo.",
  bot_ask_usage: "Usage: /ask <text> or reply to a message with /ask",
  bot_rate_limited: (min) =>
    `Rate limit exceeded. Refilled in ~${min} min.`,
  bot_ai_error: "⚠️ AI error. Try again later.",
  bot_contact_no_user_id:
    "This contact isn't on Telegram — nothing to whitelist.",
  bot_contact_is_owner:
    "You're already the owner — no whitelist entry needed.",
  bot_contact_already_whitelisted: (label) =>
    `${label} is already whitelisted.`,
  bot_contact_added: (label) => `Added ${label} to the whitelist.`,

  ui_loading: "Loading…",
  ui_saving: "Saving…",
  ui_save: "Save",
  ui_saved: "Saved",
  ui_updating: "Updating…",
  ui_open: "Open",
  ui_remove: "Remove",
  ui_edit: "Edit",
  ui_yes: "yes",
  ui_no: "no",
  ui_dash: "—",

  ui_route_settings: "Settings",
  ui_route_admin: "Bot Admin",
  ui_route_user_settings: "User Settings",
  ui_route_chat_settings: "Chat Settings",
  ui_route_my_reminders: "My Reminders",

  ui_admin_prompt: "Prompt",
  ui_admin_prompt_desc: "Models, character, timezone, provider routing",
  ui_admin_limits: "Limits",
  ui_admin_limits_desc: "Token-bucket capacity and refill",
  ui_admin_whitelist: "Whitelist",
  ui_admin_whitelist_desc: "Allowed users and chats",
  ui_admin_users: "Users",
  ui_admin_users_desc: "All users the bot has seen",
  ui_admin_chats: "Chats",
  ui_admin_chats_desc: "All chats and per-chat overrides",
  ui_admin_reminders: "Reminders",
  ui_admin_reminders_desc: "Pending reminders for everyone",

  ui_main_display_name: "Display Name",
  ui_main_name: "Name",
  ui_main_your_name: "Your name",
  ui_main_name_footer: "Name shown to the AI.",
  ui_main_gender: "Gender",
  ui_main_tell_ai: "Tell the AI",
  ui_main_male: "Male",
  ui_main_female: "Female",
  ui_main_gender_footer:
    "Sent to the AI so it uses correct grammatical gender. Off omits the field.",
  ui_main_timezone: "Timezone",
  ui_main_use_my_tz: "Use my timezone",
  ui_main_tz_footer:
    "Sent to the AI as the current date/time. Off uses the chat or global timezone.",
  ui_main_language: "Language",
  ui_main_language_footer:
    "Language for the bot UI and AI replies.",
  ui_main_lang_english: "English",
  ui_main_lang_russian: "Russian",
  ui_main_reminders: "Reminders",
  ui_main_my_reminders: "My reminders",
  ui_main_bot_config: "Bot Configuration",
  ui_main_admin_panel: "Admin panel",

  ui_whitelist_remove: "Remove from whitelist",
  ui_whitelist_add: "Add to whitelist",
  ui_whitelist_allowed_users: "Allowed Users",
  ui_whitelist_allowed_chats: "Allowed Chats",
  ui_whitelist_no_entries: "No entries",
  ui_whitelist_footer_users:
    "Add entries from a user's page via \"Add to whitelist\".",
  ui_whitelist_footer_chats:
    "Add entries from a chat's page via \"Add to whitelist\".",

  ui_prompt_models: "Models",
  ui_prompt_models_footer:
    "Primary OpenRouter model first; fallbacks are tried in order if it fails.",
  ui_prompt_provider_routing: "Provider Routing",
  ui_prompt_provider_routing_footer:
    "How OpenRouter picks a provider for the model. Default lets OpenRouter decide; the others sort by price, throughput, or latency.",
  ui_prompt_system_prompt: "System Prompt",
  ui_prompt_system_prompt_footer:
    "Character description embedded into the system instruction.",
  ui_prompt_placeholder: "Describe how the bot should behave",
  ui_prompt_timezone: "Timezone",
  ui_prompt_timezone_footer:
    "Default timezone used when the chat or user has no override.",

  ui_sort_default: "Default",
  ui_sort_price: "Price",
  ui_sort_throughput: "Throughput",
  ui_sort_latency: "Latency",

  ui_models_primary: "Primary",
  ui_models_fallback_n: (n) => `#${n}`,
  ui_models_model_id: "Model ID",
  ui_models_remove_fallback: "Remove fallback",
  ui_models_add_fallback: "Add fallback",

  ui_modelinfo_loading: "Loading model info…",
  ui_modelinfo_unknown: "Unknown model ID.",
  ui_modelinfo_resolving_provider: "Resolving provider…",
  ui_modelinfo_no_provider_data: (sort) =>
    `No provider data for sort=${sort}; showing catalog values.`,
  ui_modelinfo_provider_prefix: "Provider: ",
  ui_modelinfo_tokps: "tok/s",
  ui_modelinfo_ms: "ms",
  ui_modelinfo_input: "Input",
  ui_modelinfo_output: "Output",
  ui_modelinfo_image: "Image",
  ui_modelinfo_modalities: "Modalities",
  ui_modelinfo_tools: "Tools",
  ui_modelinfo_caching: "Caching",

  ui_ratelimit_limits: "Limits",
  ui_ratelimit_capacity: "Capacity",
  ui_ratelimit_refill_amount: "Refill amount",
  ui_ratelimit_refill_every: "Refill every",
  ui_ratelimit_min_unit: "min",
  ui_ratelimit_owner_exempt: "Owner exempt",
  ui_ratelimit_footer:
    "Tokens are deducted from each user's bucket per /ask. The bucket lazily refills based on the interval.",
  ui_ratelimit_my_bucket: "My Bucket",
  ui_ratelimit_tokens: "Tokens",
  ui_ratelimit_last_refill: "Last refill",
  ui_ratelimit_reset: "Reset to capacity",
  ui_ratelimit_no_bucket: "No bucket yet — will be seeded on first /ask.",

  ui_users_all: "All Users",
  ui_users_empty: "No users yet — they appear after their first message.",
  ui_users_footer:
    "Users are recorded automatically the first time they message the bot.",

  ui_user_not_found: "User not found.",
  ui_user_profile: "Profile",
  ui_user_name: "Name",
  ui_user_username: "Username",
  ui_user_id: "ID",
  ui_user_last_seen: "Last seen",
  ui_user_open_in_tg: "Open in Telegram",
  ui_user_display_name_footer:
    "Override the name shown to the AI for this user.",

  ui_chats_all: "All Chats",
  ui_chats_empty: "No chats yet — they appear after the first message.",
  ui_chats_footer:
    "Per-chat overrides apply on top of the global Prompt / Limits / Models.",
  ui_chat_private: "Private chat",

  ui_chat_not_found: "Chat not found.",
  ui_chat_chat: "Chat",
  ui_chat_title: "Title",
  ui_chat_type: "Type",
  ui_chat_username: "Username",
  ui_chat_id: "ID",
  ui_chat_last_seen: "Last seen",
  ui_chat_bot_name: "Bot Name",
  ui_chat_bot_name_placeholder: "Leave empty to disable",
  ui_chat_bot_name_footer:
    "When set, every AI reply in this chat starts with the name in bold.",
  ui_chat_override_global: "Override global",
  ui_chat_system_prompt: "System Prompt",
  ui_chat_system_prompt_on_footer: "Character description for this chat.",
  ui_chat_system_prompt_off_footer: (chars) =>
    `Using global character (${chars} chars).`,
  ui_chat_models: "Models",
  ui_chat_models_on_footer:
    "Primary first; fallbacks used in order if it fails.",
  ui_chat_models_off_footer: (list) => `Using global: ${list}`,
  ui_chat_rate_limit: "Rate Limit",
  ui_chat_rate_limit_on_footer:
    "These limits apply to this chat instead of the global config.",
  ui_chat_rate_limit_off_footer: "Using global limits.",
  ui_chat_tz: "Timezone",
  ui_chat_tz_on_footer: "Used unless a user has set their own timezone.",
  ui_chat_tz_off_footer: (tz) => `Using global timezone (${tz}).`,
  ui_chat_provider_routing: "Provider Routing",
  ui_chat_provider_routing_on_footer:
    "How OpenRouter picks a provider for the model in this chat.",
  ui_chat_provider_routing_off_footer: (sort) =>
    `Using global routing (${sort}).`,
  ui_chat_prompt_placeholder:
    "Describe how the bot should behave in this chat",

  ui_tz_area: "Area",
  ui_tz_location: "Location",

  ui_reminders_upcoming: "Upcoming",
  ui_reminders_empty_my: "No reminders scheduled.",
  ui_reminders_footer_my: "Ask the bot in chat to schedule a reminder.",
  ui_reminders_admin_header: "All Reminders",
  ui_reminders_admin_empty: "No reminders scheduled by anyone.",
  ui_reminders_admin_footer:
    "Pending reminders across all users. Failed deliveries that hit a transient error stay until they succeed or hit a permanent failure.",
  ui_reminders_dm: "DM",
  ui_reminders_chat_fallback: (id) => `chat ${id}`,
};

const ru: Strings = {
  bot_private: "Привет! Этот бот приватный.",
  bot_admin_installed:
    "Панель администратора установлена. Нажми кнопку меню слева от поля ввода.",
  bot_admin_menu_label: "Админ",
  bot_photo_cant_fetch: "⚠️ Не удалось загрузить прикреплённое фото.",
  bot_ask_usage:
    "Использование: /ask <текст> или ответь на сообщение командой /ask",
  bot_rate_limited: (min) =>
    `Лимит запросов исчерпан. Восстановится примерно через ${min} мин.`,
  bot_ai_error: "⚠️ Ошибка ИИ. Попробуй позже.",
  bot_contact_no_user_id:
    "Этот контакт не зарегистрирован в Telegram — добавлять в белый список нечего.",
  bot_contact_is_owner:
    "Ты уже владелец бота — запись в белом списке не нужна.",
  bot_contact_already_whitelisted: (label) =>
    `${label} уже в белом списке.`,
  bot_contact_added: (label) => `${label} добавлен(а) в белый список.`,

  ui_loading: "Загрузка…",
  ui_saving: "Сохранение…",
  ui_save: "Сохранить",
  ui_saved: "Сохранено",
  ui_updating: "Обновление…",
  ui_open: "Открыть",
  ui_remove: "Удалить",
  ui_edit: "Изменить",
  ui_yes: "да",
  ui_no: "нет",
  ui_dash: "—",

  ui_route_settings: "Настройки",
  ui_route_admin: "Админка",
  ui_route_user_settings: "Настройки пользователя",
  ui_route_chat_settings: "Настройки чата",
  ui_route_my_reminders: "Мои напоминания",

  ui_admin_prompt: "Промпт",
  ui_admin_prompt_desc: "Модели, персонаж, часовой пояс, провайдеры",
  ui_admin_limits: "Лимиты",
  ui_admin_limits_desc: "Ёмкость и пополнение токен-бакета",
  ui_admin_whitelist: "Белый список",
  ui_admin_whitelist_desc: "Разрешённые пользователи и чаты",
  ui_admin_users: "Пользователи",
  ui_admin_users_desc: "Все пользователи, которых видел бот",
  ui_admin_chats: "Чаты",
  ui_admin_chats_desc: "Все чаты и их переопределения",
  ui_admin_reminders: "Напоминания",
  ui_admin_reminders_desc: "Ожидающие напоминания всех пользователей",

  ui_main_display_name: "Имя для отображения",
  ui_main_name: "Имя",
  ui_main_your_name: "Ваше имя",
  ui_main_name_footer: "Имя, которое видит ИИ.",
  ui_main_gender: "Пол",
  ui_main_tell_ai: "Сообщить ИИ",
  ui_main_male: "Мужской",
  ui_main_female: "Женский",
  ui_main_gender_footer:
    "Передаётся ИИ для правильного согласования рода. Выкл — поле опускается.",
  ui_main_timezone: "Часовой пояс",
  ui_main_use_my_tz: "Использовать мой пояс",
  ui_main_tz_footer:
    "Передаётся ИИ как текущие дата и время. Выкл — используется пояс чата или глобальный.",
  ui_main_language: "Язык",
  ui_main_language_footer:
    "Язык интерфейса бота и ответов ИИ.",
  ui_main_lang_english: "Английский",
  ui_main_lang_russian: "Русский",
  ui_main_reminders: "Напоминания",
  ui_main_my_reminders: "Мои напоминания",
  ui_main_bot_config: "Настройки бота",
  ui_main_admin_panel: "Админ-панель",

  ui_whitelist_remove: "Убрать из белого списка",
  ui_whitelist_add: "Добавить в белый список",
  ui_whitelist_allowed_users: "Разрешённые пользователи",
  ui_whitelist_allowed_chats: "Разрешённые чаты",
  ui_whitelist_no_entries: "Записей нет",
  ui_whitelist_footer_users:
    "Добавляйте записи со страницы пользователя через «Добавить в белый список».",
  ui_whitelist_footer_chats:
    "Добавляйте записи со страницы чата через «Добавить в белый список».",

  ui_prompt_models: "Модели",
  ui_prompt_models_footer:
    "Сначала основная модель OpenRouter; запасные пробуются по очереди при ошибке.",
  ui_prompt_provider_routing: "Маршрутизация провайдеров",
  ui_prompt_provider_routing_footer:
    "Как OpenRouter выбирает провайдера для модели. Default — выбор OpenRouter; остальные сортируют по цене, скорости или задержке.",
  ui_prompt_system_prompt: "Системный промпт",
  ui_prompt_system_prompt_footer:
    "Описание персонажа, встраиваемое в системную инструкцию.",
  ui_prompt_placeholder: "Опиши, как должен вести себя бот",
  ui_prompt_timezone: "Часовой пояс",
  ui_prompt_timezone_footer:
    "Часовой пояс по умолчанию, когда у чата или пользователя нет своего.",

  ui_sort_default: "По умолчанию",
  ui_sort_price: "Цена",
  ui_sort_throughput: "Скорость",
  ui_sort_latency: "Задержка",

  ui_models_primary: "Основная",
  ui_models_fallback_n: (n) => `#${n}`,
  ui_models_model_id: "ID модели",
  ui_models_remove_fallback: "Удалить запасную",
  ui_models_add_fallback: "Добавить запасную",

  ui_modelinfo_loading: "Загрузка информации о модели…",
  ui_modelinfo_unknown: "Неизвестный ID модели.",
  ui_modelinfo_resolving_provider: "Определяем провайдера…",
  ui_modelinfo_no_provider_data: (sort) =>
    `Нет данных провайдера для сортировки sort=${sort}; показаны значения каталога.`,
  ui_modelinfo_provider_prefix: "Провайдер: ",
  ui_modelinfo_tokps: "ток/с",
  ui_modelinfo_ms: "мс",
  ui_modelinfo_input: "Ввод",
  ui_modelinfo_output: "Вывод",
  ui_modelinfo_image: "Изображение",
  ui_modelinfo_modalities: "Модальности",
  ui_modelinfo_tools: "Инструменты",
  ui_modelinfo_caching: "Кэширование",

  ui_ratelimit_limits: "Лимиты",
  ui_ratelimit_capacity: "Ёмкость",
  ui_ratelimit_refill_amount: "Объём пополнения",
  ui_ratelimit_refill_every: "Пополнять каждые",
  ui_ratelimit_min_unit: "мин",
  ui_ratelimit_owner_exempt: "Владелец без лимита",
  ui_ratelimit_footer:
    "Токены списываются из бакета каждого пользователя за /ask. Бакет лениво пополняется по интервалу.",
  ui_ratelimit_my_bucket: "Мой бакет",
  ui_ratelimit_tokens: "Токены",
  ui_ratelimit_last_refill: "Последнее пополнение",
  ui_ratelimit_reset: "Сбросить до полного",
  ui_ratelimit_no_bucket:
    "Бакета пока нет — он создастся при первом /ask.",

  ui_users_all: "Все пользователи",
  ui_users_empty:
    "Пользователей пока нет — они появятся после первого сообщения.",
  ui_users_footer:
    "Пользователи записываются автоматически при первом сообщении боту.",

  ui_user_not_found: "Пользователь не найден.",
  ui_user_profile: "Профиль",
  ui_user_name: "Имя",
  ui_user_username: "Username",
  ui_user_id: "ID",
  ui_user_last_seen: "Последний раз",
  ui_user_open_in_tg: "Открыть в Telegram",
  ui_user_display_name_footer:
    "Переопределить имя, которое видит ИИ для этого пользователя.",

  ui_chats_all: "Все чаты",
  ui_chats_empty: "Чатов пока нет — они появятся после первого сообщения.",
  ui_chats_footer:
    "Переопределения чата применяются поверх глобальных Промпта / Лимитов / Моделей.",
  ui_chat_private: "Приватный чат",

  ui_chat_not_found: "Чат не найден.",
  ui_chat_chat: "Чат",
  ui_chat_title: "Название",
  ui_chat_type: "Тип",
  ui_chat_username: "Username",
  ui_chat_id: "ID",
  ui_chat_last_seen: "Последний раз",
  ui_chat_bot_name: "Имя бота",
  ui_chat_bot_name_placeholder: "Пусто — выключено",
  ui_chat_bot_name_footer:
    "Если задано, каждый ответ ИИ в этом чате начинается с имени жирным.",
  ui_chat_override_global: "Переопределить глобально",
  ui_chat_system_prompt: "Системный промпт",
  ui_chat_system_prompt_on_footer: "Описание персонажа для этого чата.",
  ui_chat_system_prompt_off_footer: (chars) =>
    `Используется глобальный персонаж (${chars} симв.).`,
  ui_chat_models: "Модели",
  ui_chat_models_on_footer:
    "Сначала основная; запасные пробуются по очереди при ошибке.",
  ui_chat_models_off_footer: (list) => `Используется глобально: ${list}`,
  ui_chat_rate_limit: "Лимит запросов",
  ui_chat_rate_limit_on_footer:
    "Эти лимиты применяются к этому чату вместо глобальных.",
  ui_chat_rate_limit_off_footer: "Используются глобальные лимиты.",
  ui_chat_tz: "Часовой пояс",
  ui_chat_tz_on_footer:
    "Используется, если у пользователя нет своего пояса.",
  ui_chat_tz_off_footer: (tz) => `Используется глобальный пояс (${tz}).`,
  ui_chat_provider_routing: "Маршрутизация провайдеров",
  ui_chat_provider_routing_on_footer:
    "Как OpenRouter выбирает провайдера для модели в этом чате.",
  ui_chat_provider_routing_off_footer: (sort) =>
    `Используется глобальная маршрутизация (${sort}).`,
  ui_chat_prompt_placeholder: "Опиши, как должен вести себя бот в этом чате",

  ui_tz_area: "Регион",
  ui_tz_location: "Местоположение",

  ui_reminders_upcoming: "Предстоящие",
  ui_reminders_empty_my: "Напоминаний не запланировано.",
  ui_reminders_footer_my:
    "Попроси бота в чате запланировать напоминание.",
  ui_reminders_admin_header: "Все напоминания",
  ui_reminders_admin_empty:
    "Никто пока не запланировал напоминаний.",
  ui_reminders_admin_footer:
    "Ожидающие напоминания всех пользователей. Доставки с временными ошибками остаются до успешной или окончательной ошибки.",
  ui_reminders_dm: "ЛС",
  ui_reminders_chat_fallback: (id) => `чат ${id}`,
};

export const MESSAGES: Record<Lang, Strings> = { en, ru };

export function t(lang: Lang): Strings {
  return MESSAGES[lang];
}

export function languageSection(lang: Lang): string {
  if (lang === "ru") {
    return "# Язык ответа\n\nОтвечай на русском языке, если пользователь явно не пишет на другом.";
  }
  return "# Response language\n\nReply in English unless the user explicitly writes in another language.";
}
