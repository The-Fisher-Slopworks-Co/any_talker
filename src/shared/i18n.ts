// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

export type Lang = "en" | "ru";

export const SUPPORTED_LANGS: readonly Lang[] = ["en", "ru"];
export const DEFAULT_LANG: Lang = "en";

export function isValidLang(v: unknown): v is Lang {
  return v === "en" || v === "ru";
}

export function normalizeLang(code: string | null | undefined): Lang | null {
  if (typeof code !== "string" || code.length === 0) return null;
  const prefix = code.toLowerCase().split("-")[0]!;
  return isValidLang(prefix) ? prefix : null;
}

export function resolveLang(
  storedPref: Lang | null,
  telegramCode: string | null | undefined,
): Lang {
  return storedPref ?? normalizeLang(telegramCode) ?? DEFAULT_LANG;
}

export type ReminderTimeParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  offset: string;
};

type Strings = {
  bot_photo_cant_fetch: string;
  bot_voice_cant_fetch: string;
  bot_ask_usage: string;
  bot_rate_limited: (min: number) => string;
  bot_ai_error: string;
  bot_contact_no_user_id: string;
  bot_contact_is_owner: string;
  bot_contact_already_whitelisted: (label: string) => string;
  bot_contact_added: (label: string) => string;
  bot_check_wrong_user: string;
  bot_reminder_scheduled: (parts: ReminderTimeParts) => string;

  ui_loading: string;
  ui_saving: string;
  ui_save: string;
  ui_saved: string;
  ui_updating: string;
  ui_remove: string;
  ui_yes: string;
  ui_no: string;
  ui_dash: string;

  ui_route_settings: string;
  ui_route_admin: string;
  ui_route_user_settings: string;
  ui_route_chat_settings: string;
  ui_route_my_reminders: string;
  ui_route_byok: string;

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
  ui_admin_checks: string;
  ui_admin_checks_desc: string;

  ui_main_display_name: string;
  ui_main_name: string;
  ui_main_your_name: string;
  ui_main_name_footer: string;
  ui_main_name_err_too_long: string;
  ui_main_name_err_multiline: string;
  ui_main_name_err_control_char: string;
  ui_main_name_err_charset: string;
  ui_main_name_err_blocked_token: string;
  ui_main_name_err_no_letter: string;
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

  ui_main_byok: string;
  ui_main_byok_footer: string;
  ui_main_byok_key_label: string;
  ui_main_byok_placeholder: string;
  ui_main_byok_save: string;
  ui_main_byok_clear: string;
  ui_main_byok_replace: string;
  ui_main_byok_cancel: string;
  ui_main_byok_open: string;

  ui_byok_key_section: string;
  ui_byok_key_footer: string;
  ui_byok_models_section: string;
  ui_byok_models_footer_inactive: string;
  ui_byok_models_override: string;
  ui_byok_models_on_footer: string;
  ui_byok_models_off_footer: string;

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
  ui_prompt_service_tier: string;
  ui_prompt_service_tier_footer: string;
  ui_prompt_system_prompt: string;
  ui_prompt_system_prompt_footer: string;
  ui_prompt_placeholder: string;
  ui_prompt_timezone: string;
  ui_prompt_timezone_footer: string;
  ui_prompt_expandable_threshold: string;
  ui_prompt_expandable_threshold_footer: string;

  ui_sort_default: string;
  ui_sort_price: string;
  ui_sort_throughput: string;
  ui_sort_latency: string;

  ui_tier_default: string;
  ui_tier_flex: string;
  ui_tier_priority: string;

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
  ui_ratelimit_wise_multiplier: string;
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
  ui_user_bucket: string;

  ui_spending_title: string;
  ui_spending_day: string;
  ui_spending_week: string;
  ui_spending_month: string;
  ui_spending_month_short: (amount: string) => string;
  ui_spending_footer: string;

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
  ui_chat_service_tier: string;
  ui_chat_service_tier_on_footer: string;
  ui_chat_service_tier_off_footer: (tier: string) => string;
  ui_chat_prompt_placeholder: string;
  ui_chat_keyword_filter: string;
  ui_chat_keyword_filter_enabled: string;
  ui_chat_keyword_filter_placeholder: string;
  ui_chat_keyword_filter_footer: string;

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

  ui_route_checks: string;
  ui_route_check_edit: string;
  ui_route_check_create: string;
  ui_checks_all: string;
  ui_checks_empty: string;
  ui_checks_footer: string;
  ui_checks_create: string;
  ui_checks_enabled: string;
  ui_checks_disabled: string;
  ui_checks_paused_marker: string;
  ui_checks_status: string;
  ui_check_title: string;
  ui_check_title_placeholder: string;
  ui_check_chat_id: string;
  ui_check_chat_id_placeholder: string;
  ui_check_chat_id_footer: string;
  ui_check_target_user_id: string;
  ui_check_target_user_id_placeholder: string;
  ui_check_target_user_id_footer: string;
  ui_check_target_name: string;
  ui_check_target_name_placeholder: string;
  ui_check_target_name_footer: string;
  ui_check_schedule: string;
  ui_check_schedule_footer: string;
  ui_check_timezone: string;
  ui_check_timezone_footer: string;
  ui_check_timeout: string;
  ui_check_timeout_footer: string;
  ui_check_question: string;
  ui_check_question_placeholder: string;
  ui_check_question_footer: string;
  ui_check_yes_button: string;
  ui_check_no_button: string;
  ui_check_yes_reply: string;
  ui_check_yes_reply_placeholder: string;
  ui_check_no_reply: string;
  ui_check_no_reply_placeholder: string;
  ui_check_replies_footer: string;
  ui_check_counter: string;
  ui_check_counter_footer: string;
  ui_check_counter_source: string;
  ui_check_counter_source_manual: string;
  ui_check_counter_source_date: string;
  ui_check_counter_source_footer: string;
  ui_check_counter_anchor_date: string;
  ui_check_counter_anchor_date_footer: string;
  ui_check_counter_mode: string;
  ui_check_counter_mode_always: string;
  ui_check_counter_mode_reset: string;
  ui_check_counter_mode_footer: string;
  ui_check_enabled_label: string;
  ui_check_enabled_footer: string;
  ui_check_delete: string;
  ui_check_delete_confirm: string;
  ui_check_not_found: string;
  ui_check_last_fired: string;
  ui_check_last_fired_never: string;
  ui_check_pending: string;
  ui_check_pending_yes: string;
  ui_check_pending_no: string;
  ui_check_save_validation_error: (code: string) => string;
};

const en: Strings = {
  bot_photo_cant_fetch: "⚠️ Couldn't fetch the attached photo.",
  bot_voice_cant_fetch: "⚠️ Couldn't fetch the voice message.",
  bot_ask_usage:
    "Usage: /ask <text> (short), /askwise <text> (detailed) — or reply to a message with either.",
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
  bot_check_wrong_user: "This check isn't addressed to you.",
  bot_reminder_scheduled: (p) => {
    const pad = (n: number) => n.toString().padStart(2, "0");
    return `Reminder set for ${p.year}-${pad(p.month)}-${pad(p.day)} at ${pad(p.hour)}:${pad(p.minute)} (${p.offset})`;
  },

  ui_loading: "Loading…",
  ui_saving: "Saving…",
  ui_save: "Save",
  ui_saved: "Saved",
  ui_updating: "Updating…",
  ui_remove: "Remove",
  ui_yes: "yes",
  ui_no: "no",
  ui_dash: "—",

  ui_route_settings: "Settings",
  ui_route_admin: "Bot Admin",
  ui_route_user_settings: "User Settings",
  ui_route_chat_settings: "Chat Settings",
  ui_route_my_reminders: "My Reminders",
  ui_route_byok: "OpenRouter",

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
  ui_admin_checks: "Checks",
  ui_admin_checks_desc: "Recurring daily questions with Yes/No buttons",

  ui_main_display_name: "Display Name",
  ui_main_name: "Name",
  ui_main_your_name: "Your name",
  ui_main_name_footer: "Name shown to the AI.",
  ui_main_name_err_too_long: "Too long (max 32 characters).",
  ui_main_name_err_multiline: "Line breaks are not allowed.",
  ui_main_name_err_control_char: "Contains hidden or invisible characters.",
  ui_main_name_err_charset:
    "Only letters, digits, spaces and . ' - are allowed.",
  ui_main_name_err_blocked_token: "Contains a reserved keyword.",
  ui_main_name_err_no_letter: "Must contain at least one letter.",
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

  ui_main_byok: "OpenRouter API Key",
  ui_main_byok_footer:
    "Use your own OpenRouter key for AI calls. When set, the bot's rate limit doesn't apply to you. The key is stored on the server and used only for your /ask requests.",
  ui_main_byok_key_label: "Key",
  ui_main_byok_placeholder: "sk-or-…",
  ui_main_byok_save: "Save",
  ui_main_byok_clear: "Remove",
  ui_main_byok_replace: "Replace",
  ui_main_byok_cancel: "Cancel",
  ui_main_byok_open: "OpenRouter (BYOK)",

  ui_byok_key_section: "API Key",
  ui_byok_key_footer:
    "Use your own OpenRouter key for AI calls. When set, the bot's rate limit doesn't apply to you. The key is stored on the server and used only for your /ask requests.",
  ui_byok_models_section: "Models",
  ui_byok_models_footer_inactive:
    "Add an API key above to choose your own models.",
  ui_byok_models_override: "Use my models",
  ui_byok_models_on_footer:
    "Primary OpenRouter model first; fallbacks are tried in order if it fails. Applied only to your own requests.",
  ui_byok_models_off_footer:
    "Using the bot's default models.",

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
    "How OpenRouter picks a provider for the model. Auto lets OpenRouter decide; the others sort by price, throughput, or latency.",
  ui_prompt_service_tier: "Service Tier",
  ui_prompt_service_tier_footer:
    "Processing tier for OpenRouter requests. Default uses standard processing; Flex is cheaper but slower with lower availability; Priority is faster at a higher cost.",
  ui_prompt_system_prompt: "System Prompt",
  ui_prompt_system_prompt_footer:
    "Character description embedded into the system instruction.",
  ui_prompt_placeholder: "Describe how the bot should behave",
  ui_prompt_timezone: "Timezone",
  ui_prompt_timezone_footer:
    "Default timezone used when the chat or user has no override.",
  ui_prompt_expandable_threshold: "Collapse threshold",
  ui_prompt_expandable_threshold_footer:
    "Replies longer than this many characters are hidden under an expandable quote. Set to 0 to collapse everything.",

  ui_sort_default: "Auto",
  ui_sort_price: "Price",
  ui_sort_throughput: "Throughput",
  ui_sort_latency: "Latency",

  ui_tier_default: "Default",
  ui_tier_flex: "Flex",
  ui_tier_priority: "Priority",

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
  ui_ratelimit_wise_multiplier: "/askwise multiplier",
  ui_ratelimit_footer:
    "Tokens are deducted from each user's bucket per /ask. /askwise spends the deduction times the multiplier. The bucket lazily refills based on the interval.",
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
  ui_user_bucket: "Rate Limit Buckets",

  ui_spending_title: "Spending",
  ui_spending_day: "Today",
  ui_spending_week: "Last 7 days",
  ui_spending_month: "Last 30 days",
  ui_spending_month_short: (amount) => `30d: ${amount}`,
  ui_spending_footer:
    "Money spent on AI requests, in USD, as reported by OpenRouter. Periods are trailing windows by UTC date.",

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
  ui_chat_service_tier: "Service Tier",
  ui_chat_service_tier_on_footer:
    "Processing tier for OpenRouter requests in this chat.",
  ui_chat_service_tier_off_footer: (tier) => `Using global tier (${tier}).`,
  ui_chat_prompt_placeholder:
    "Describe how the bot should behave in this chat",
  ui_chat_keyword_filter: "Keyword Filter",
  ui_chat_keyword_filter_enabled: "Enabled",
  ui_chat_keyword_filter_placeholder: "word1, word2, word3",
  ui_chat_keyword_filter_footer:
    "Comma-separated keywords. When enabled, any new message whose text or caption contains one of these substrings (case-insensitive) is deleted by the bot.",

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

  ui_route_checks: "Checks",
  ui_route_check_edit: "Edit Check",
  ui_route_check_create: "New Check",
  ui_checks_all: "Recurring Checks",
  ui_checks_empty: "No checks yet. Tap \"New check\" to create one.",
  ui_checks_footer:
    "Each check sends a question at a daily time. The target user taps Yes/No; non-answers time out as No.",
  ui_checks_create: "New check",
  ui_checks_enabled: "Enabled",
  ui_checks_disabled: "Paused",
  ui_checks_paused_marker: "paused",
  ui_checks_status: "Status",
  ui_check_title: "Title",
  ui_check_title_placeholder: "e.g. Sport for Nikita",
  ui_check_chat_id: "Chat ID",
  ui_check_chat_id_placeholder: "-100123456789",
  ui_check_chat_id_footer:
    "Numeric Telegram chat ID where the question gets posted. For supergroups it starts with -100.",
  ui_check_target_user_id: "Target user ID",
  ui_check_target_user_id_placeholder: "123456789",
  ui_check_target_user_id_footer:
    "Numeric user ID who is being asked. Only this user's clicks count.",
  ui_check_target_name: "Name shown",
  ui_check_target_name_placeholder: "Nikita",
  ui_check_target_name_footer:
    "Substituted for {name} in the question and replies. In the question it renders as a clickable mention that pings the user; in replies it appears as plain text.",
  ui_check_schedule: "Time",
  ui_check_schedule_footer:
    "Daily wall-clock time in the timezone below. The bot fires at most once per day.",
  ui_check_timezone: "Timezone",
  ui_check_timezone_footer:
    "Timezone used to interpret the daily time above.",
  ui_check_timeout: "Timeout (minutes)",
  ui_check_timeout_footer:
    "If the user hasn't clicked within this many minutes, the check resolves as if they tapped No.",
  ui_check_question: "Question",
  ui_check_question_placeholder:
    "{name}, did you do sport today?",
  ui_check_question_footer:
    "Sent at the scheduled time. {name} becomes a clickable mention that pings the user; {count} is the current counter.",
  ui_check_yes_button: "\"Yes\" button label",
  ui_check_no_button: "\"No\" button label",
  ui_check_yes_reply: "Reply when Yes",
  ui_check_yes_reply_placeholder:
    "{name}, at least don't lie to yourself. Day without sport {count}",
  ui_check_no_reply: "Reply when No / timeout",
  ui_check_no_reply_placeholder: "{name}. Day without sport {count}",
  ui_check_replies_footer:
    "{name} is the target's plain-text name (no mention); {count} is the counter after this answer.",
  ui_check_counter: "Counter",
  ui_check_counter_footer:
    "Current value of {count}. Adjust manually if needed.",
  ui_check_counter_source: "Counter source",
  ui_check_counter_source_manual: "Manual number",
  ui_check_counter_source_date: "Days since a date",
  ui_check_counter_source_footer:
    "Manual: counter is stored and adjusted on each answer. Days since a date: {count} is computed live as the number of days from the anchor date to today in the check's timezone.",
  ui_check_counter_anchor_date: "Anchor date",
  ui_check_counter_anchor_date_footer:
    "{count} = days from this date to today. With \"Reset to 0 on Yes\", a Yes answer moves the anchor to today.",
  ui_check_counter_mode: "Counter on Yes",
  ui_check_counter_mode_always: "Always increment (trolling mode)",
  ui_check_counter_mode_reset: "Reset to 0 (real streak)",
  ui_check_counter_mode_footer:
    "Always increment: counter grows whatever the user clicks. Reset on Yes: streak resets when the user confirms.",
  ui_check_enabled_label: "Enabled",
  ui_check_enabled_footer:
    "Disabled checks neither fire nor time out. Pending question messages stay in the chat until resumed.",
  ui_check_delete: "Delete check",
  ui_check_delete_confirm: "Delete this check? This cannot be undone.",
  ui_check_not_found: "Check not found.",
  ui_check_last_fired: "Last fired",
  ui_check_last_fired_never: "Never",
  ui_check_pending: "Pending reply",
  ui_check_pending_yes: "Yes",
  ui_check_pending_no: "No",
  ui_check_save_validation_error: (code) => `Validation error: ${code}`,
};

const ru: Strings = {
  bot_photo_cant_fetch: "⚠️ Не удалось загрузить прикреплённое фото.",
  bot_voice_cant_fetch: "⚠️ Не удалось загрузить голосовое сообщение.",
  bot_ask_usage:
    "Использование: /ask <текст> (коротко), /askwise <текст> (подробно) — или ответь на сообщение любой из этих команд.",
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
  bot_check_wrong_user: "Этот вопрос адресован не тебе.",
  bot_reminder_scheduled: (p) => {
    const pad = (n: number) => n.toString().padStart(2, "0");
    return `Было создано напоминание на ${pad(p.day)}.${pad(p.month)}.${p.year} в ${pad(p.hour)}:${pad(p.minute)} (${p.offset})`;
  },

  ui_loading: "Загрузка…",
  ui_saving: "Сохранение…",
  ui_save: "Сохранить",
  ui_saved: "Сохранено",
  ui_updating: "Обновление…",
  ui_remove: "Удалить",
  ui_yes: "да",
  ui_no: "нет",
  ui_dash: "—",

  ui_route_settings: "Настройки",
  ui_route_admin: "Админка",
  ui_route_user_settings: "Настройки пользователя",
  ui_route_chat_settings: "Настройки чата",
  ui_route_my_reminders: "Мои напоминания",
  ui_route_byok: "OpenRouter",

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
  ui_admin_checks: "Чеки",
  ui_admin_checks_desc: "Циклические вопросы с кнопками Да/Нет",

  ui_main_display_name: "Имя для отображения",
  ui_main_name: "Имя",
  ui_main_your_name: "Ваше имя",
  ui_main_name_footer: "Имя, которое видит ИИ.",
  ui_main_name_err_too_long: "Слишком длинное (макс. 32 символа).",
  ui_main_name_err_multiline: "Переносы строк недопустимы.",
  ui_main_name_err_control_char: "Содержит скрытые или невидимые символы.",
  ui_main_name_err_charset:
    "Допустимы только буквы, цифры, пробел и . ' -",
  ui_main_name_err_blocked_token: "Содержит зарезервированное ключевое слово.",
  ui_main_name_err_no_letter: "Должно содержать хотя бы одну букву.",
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

  ui_main_byok: "Ключ OpenRouter API",
  ui_main_byok_footer:
    "Используйте свой ключ OpenRouter для вызовов ИИ. Когда ключ задан, лимит запросов бота на вас не действует. Ключ хранится на сервере и применяется только к вашим запросам /ask.",
  ui_main_byok_key_label: "Ключ",
  ui_main_byok_placeholder: "sk-or-…",
  ui_main_byok_save: "Сохранить",
  ui_main_byok_clear: "Удалить",
  ui_main_byok_replace: "Заменить",
  ui_main_byok_cancel: "Отмена",
  ui_main_byok_open: "OpenRouter (BYOK)",

  ui_byok_key_section: "API-ключ",
  ui_byok_key_footer:
    "Используйте свой ключ OpenRouter для вызовов ИИ. Когда ключ задан, лимит запросов бота на вас не действует. Ключ хранится на сервере и применяется только к вашим запросам /ask.",
  ui_byok_models_section: "Модели",
  ui_byok_models_footer_inactive:
    "Чтобы выбрать свои модели, сначала добавьте API-ключ выше.",
  ui_byok_models_override: "Использовать свои модели",
  ui_byok_models_on_footer:
    "Сначала основная модель OpenRouter; запасные пробуются по очереди при ошибке. Применяется только к вашим запросам.",
  ui_byok_models_off_footer:
    "Используются модели бота по умолчанию.",

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
    "Как OpenRouter выбирает провайдера для модели. «Авто» — выбор OpenRouter; остальные сортируют по цене, скорости или задержке.",
  ui_prompt_service_tier: "Тариф обслуживания",
  ui_prompt_service_tier_footer:
    "Тариф обработки запросов OpenRouter. «По умолчанию» — стандартная обработка; Flex дешевле, но медленнее и менее доступен; Priority быстрее, но дороже.",
  ui_prompt_system_prompt: "Системный промпт",
  ui_prompt_system_prompt_footer:
    "Описание персонажа, встраиваемое в системную инструкцию.",
  ui_prompt_placeholder: "Опиши, как должен вести себя бот",
  ui_prompt_timezone: "Часовой пояс",
  ui_prompt_timezone_footer:
    "Часовой пояс по умолчанию, когда у чата или пользователя нет своего.",
  ui_prompt_expandable_threshold: "Порог сворачивания",
  ui_prompt_expandable_threshold_footer:
    "Ответы длиннее указанного числа символов прячутся под раскрывающуюся цитату. 0 — сворачивать всегда.",

  ui_sort_default: "Авто",
  ui_sort_price: "Цена",
  ui_sort_throughput: "Скорость",
  ui_sort_latency: "Задержка",

  ui_tier_default: "По умолчанию",
  ui_tier_flex: "Flex",
  ui_tier_priority: "Priority",

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
  ui_ratelimit_wise_multiplier: "Коэффициент /askwise",
  ui_ratelimit_footer:
    "Токены списываются из бакета каждого пользователя за /ask. Для /askwise списание умножается на коэффициент. Бакет лениво пополняется по интервалу.",
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
  ui_user_bucket: "Бакеты лимита",

  ui_spending_title: "Расходы",
  ui_spending_day: "Сегодня",
  ui_spending_week: "За 7 дней",
  ui_spending_month: "За 30 дней",
  ui_spending_month_short: (amount) => `30д: ${amount}`,
  ui_spending_footer:
    "Деньги, потраченные на запросы к ИИ, в USD, по данным OpenRouter. Периоды — скользящие окна по датам UTC.",

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
  ui_chat_service_tier: "Тариф обслуживания",
  ui_chat_service_tier_on_footer:
    "Тариф обработки запросов OpenRouter в этом чате.",
  ui_chat_service_tier_off_footer: (tier) =>
    `Используется глобальный тариф (${tier}).`,
  ui_chat_prompt_placeholder: "Опиши, как должен вести себя бот в этом чате",
  ui_chat_keyword_filter: "Фильтр по ключевым словам",
  ui_chat_keyword_filter_enabled: "Включён",
  ui_chat_keyword_filter_placeholder: "слово1, слово2, слово3",
  ui_chat_keyword_filter_footer:
    "Ключевые слова через запятую. Когда включено, новые сообщения, в тексте или подписи которых встречается одна из этих подстрок (без учёта регистра), удаляются ботом.",

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

  ui_route_checks: "Чеки",
  ui_route_check_edit: "Редактирование чека",
  ui_route_check_create: "Новый чек",
  ui_checks_all: "Циклические чеки",
  ui_checks_empty: "Чеков ещё нет. Нажми «Новый чек», чтобы создать.",
  ui_checks_footer:
    "Каждый чек присылает вопрос в указанное время. Целевой пользователь жмёт Да/Нет; отсутствие ответа считается как Нет.",
  ui_checks_create: "Новый чек",
  ui_checks_enabled: "Включён",
  ui_checks_disabled: "Пауза",
  ui_checks_paused_marker: "пауза",
  ui_checks_status: "Статус",
  ui_check_title: "Название",
  ui_check_title_placeholder: "напр. Спорт для Никиты",
  ui_check_chat_id: "ID чата",
  ui_check_chat_id_placeholder: "-100123456789",
  ui_check_chat_id_footer:
    "Числовой ID чата Telegram, куда отправляется вопрос. У супергрупп начинается с -100.",
  ui_check_target_user_id: "ID пользователя",
  ui_check_target_user_id_placeholder: "123456789",
  ui_check_target_user_id_footer:
    "Числовой ID того, кому задаётся вопрос. Только клики этого пользователя засчитываются.",
  ui_check_target_name: "Имя в сообщениях",
  ui_check_target_name_placeholder: "Никита",
  ui_check_target_name_footer:
    "Подставляется на место {name} в вопросе и ответах. В вопросе — как кликабельное упоминание, пингующее пользователя; в ответах — просто текстом.",
  ui_check_schedule: "Время",
  ui_check_schedule_footer:
    "Время суток в указанном ниже часовом поясе. Бот сработает не больше одного раза в сутки.",
  ui_check_timezone: "Часовой пояс",
  ui_check_timezone_footer:
    "Часовой пояс, в котором интерпретируется время выше.",
  ui_check_timeout: "Таймаут (минуты)",
  ui_check_timeout_footer:
    "Если за это время пользователь не нажал кнопку, чек резолвится как «Нет».",
  ui_check_question: "Вопрос",
  ui_check_question_placeholder:
    "{name}, занялся ли ты сегодня спортом?",
  ui_check_question_footer:
    "Отправляется в назначенное время. {name} — кликабельное упоминание, пингующее пользователя; {count} — текущий счётчик.",
  ui_check_yes_button: "Подпись кнопки «Да»",
  ui_check_no_button: "Подпись кнопки «Нет»",
  ui_check_yes_reply: "Ответ при «Да»",
  ui_check_yes_reply_placeholder:
    "{name}, хотя бы себе не ври. День без спорта {count}",
  ui_check_no_reply: "Ответ при «Нет» / таймауте",
  ui_check_no_reply_placeholder: "{name}. День без спорта {count}",
  ui_check_replies_footer:
    "{name} — имя пользователя обычным текстом (без упоминания); {count} — счётчик после этого ответа.",
  ui_check_counter: "Счётчик",
  ui_check_counter_footer:
    "Текущее значение {count}. При необходимости можно поправить вручную.",
  ui_check_counter_source: "Источник счётчика",
  ui_check_counter_source_manual: "Ручное число",
  ui_check_counter_source_date: "Дни с даты",
  ui_check_counter_source_footer:
    "«Ручное число» — счётчик хранится и меняется на ответы. «Дни с даты» — {count} вычисляется как число дней от опорной даты до сегодня в часовом поясе чека.",
  ui_check_counter_anchor_date: "Опорная дата",
  ui_check_counter_anchor_date_footer:
    "{count} — количество дней от этой даты до сегодня. При режиме «Сбрасывать в 0 при Да» ответ «Да» переносит опорную дату на сегодня.",
  ui_check_counter_mode: "Счётчик при «Да»",
  ui_check_counter_mode_always:
    "Всегда увеличивать (режим подколки)",
  ui_check_counter_mode_reset: "Сбрасывать в 0 (настоящий стрик)",
  ui_check_counter_mode_footer:
    "«Всегда увеличивать» — счётчик растёт независимо от ответа. «Сбрасывать» — обнуляется при «Да».",
  ui_check_enabled_label: "Включён",
  ui_check_enabled_footer:
    "Выключенный чек не срабатывает и не таймаутится. Уже висящее сообщение с кнопками остаётся в чате до включения.",
  ui_check_delete: "Удалить чек",
  ui_check_delete_confirm: "Удалить чек? Действие нельзя отменить.",
  ui_check_not_found: "Чек не найден.",
  ui_check_last_fired: "Последний раз",
  ui_check_last_fired_never: "Никогда",
  ui_check_pending: "Ждёт ответа",
  ui_check_pending_yes: "Да",
  ui_check_pending_no: "Нет",
  ui_check_save_validation_error: (code) => `Ошибка валидации: ${code}`,
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
