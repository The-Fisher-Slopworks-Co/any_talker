// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import type { WindowKind } from "./types";

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
  bot_rate_limited: (limitedBy: WindowKind, msUntilReset: number) => string;
  bot_ai_error: string;
  bot_details_summary: string;
  bot_contact_no_user_id: string;
  bot_contact_is_owner: string;
  bot_contact_already_whitelisted: (label: string) => string;
  bot_contact_added: (label: string) => string;
  bot_check_wrong_user: string;
  bot_reminder_scheduled: (parts: ReminderTimeParts) => string;
  bot_managed_bot_created: (username: string) => string;

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

  ui_whitelist_remove: string;
  ui_whitelist_add: string;
  ui_whitelist_allowed_users: string;
  ui_whitelist_allowed_chats: string;
  ui_whitelist_no_entries: string;
  ui_whitelist_footer_users: string;
  ui_whitelist_footer_chats: string;

  ui_prompt_models: string;
  ui_prompt_models_footer: string;
  ui_prompt_system_prompt: string;
  ui_prompt_system_prompt_footer: string;
  ui_prompt_placeholder: string;
  ui_prompt_timezone: string;
  ui_prompt_timezone_footer: string;
  ui_prompt_expandable_threshold: string;
  ui_prompt_expandable_threshold_footer: string;

  ui_models_model_id: string;
  ui_models_not_in_catalog: string;

  ui_modelinfo_loading: string;
  ui_modelinfo_input: string;
  ui_modelinfo_output: string;
  ui_modelinfo_image: string;
  ui_modelinfo_modalities: string;
  ui_modelinfo_tools: string;

  ui_ratelimit_limits: string;
  ui_ratelimit_5h_tokens: string;
  ui_ratelimit_weekly_tokens: string;
  ui_ratelimit_owner_exempt: string;
  ui_ratelimit_wise_multiplier: string;
  ui_ratelimit_footer: string;
  ui_ratelimit_my_usage: string;
  ui_ratelimit_5h_window: string;
  ui_ratelimit_weekly_window: string;
  ui_ratelimit_resets: string;
  ui_ratelimit_reset: string;

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
  ui_user_set_language: string;
  ui_user_usage: string;

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
  ui_chat_tz: string;
  ui_chat_tz_on_footer: string;
  ui_chat_tz_off_footer: (tz: string) => string;
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

  ui_admin_bots: string;
  ui_admin_bots_desc: string;
  ui_route_bot_edit: string;
  ui_route_bot_create: string;
  ui_mbots_all: string;
  ui_mbots_empty: string;
  ui_mbots_footer: string;
  ui_mbots_create: string;
  ui_mbots_running: string;
  ui_mbots_stopped: string;
  ui_mbot_display_name: string;
  ui_mbot_display_name_placeholder: string;
  ui_mbot_username: string;
  ui_mbot_system_prompt: string;
  ui_mbot_system_prompt_placeholder: string;
  ui_mbot_system_prompt_footer: string;
  ui_mbot_status: string;
  ui_mbot_avatar: string;
  ui_mbot_avatar_upload: string;
  ui_mbot_avatar_footer: string;
  ui_mbot_avatar_saved: string;
  ui_mbot_avatar_failed: string;
  ui_mbot_delete: string;
  ui_mbot_delete_confirm: string;
  ui_mbot_not_found: string;
  ui_mbot_save_error: (code: string) => string;
  ui_mbot_create_intro: string;
  ui_mbot_create_need_manage: string;
  ui_mbot_create_name: string;
  ui_mbot_create_name_placeholder: string;
  ui_mbot_create_username: string;
  ui_mbot_create_username_placeholder: string;
  ui_mbot_create_open: string;
  ui_mbot_create_footer: string;
};

// Human-readable "time until reset" for rate-limit notices, in adaptive units:
// a 5-hour-window wait reads in minutes/hours, a weekly one in hours/days.
function etaEn(ms: number): string {
  const min = Math.max(1, Math.ceil(ms / 60_000));
  if (min < 90) return `${min} min`;
  const hours = Math.ceil(min / 60);
  if (hours < 48) return `${hours} h`;
  return `${Math.ceil(hours / 24)} d`;
}

function etaRu(ms: number): string {
  const min = Math.max(1, Math.ceil(ms / 60_000));
  if (min < 90) return `${min} мин`;
  const hours = Math.ceil(min / 60);
  if (hours < 48) return `${hours} ч`;
  return `${Math.ceil(hours / 24)} дн`;
}

const en: Strings = {
  bot_photo_cant_fetch: "⚠️ Couldn't fetch the attached photo.",
  bot_voice_cant_fetch: "⚠️ Couldn't fetch the voice message.",
  bot_ask_usage:
    "Usage: /ask <text> (short), /askwise <text> (detailed) — or reply to a message with either.",
  bot_rate_limited: (limitedBy, ms) =>
    limitedBy === "weekly"
      ? `Weekly token limit reached. Resets in ~${etaEn(ms)}.`
      : `5-hour token limit reached. Resets in ~${etaEn(ms)}.`,
  bot_ai_error: "⚠️ AI error. Try again later.",
  bot_details_summary: "Expand reply",
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
  bot_managed_bot_created: (username) =>
    `✅ Managed bot @${username} is now running.`,

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

  ui_admin_prompt: "Prompt",
  ui_admin_prompt_desc: "Models, character, timezone, collapse threshold",
  ui_admin_limits: "Limits",
  ui_admin_limits_desc: "5-hour and weekly token budgets",
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
    "The model the bot uses. Only the first model is sent; the endpoint has no server-side fallback.",
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

  ui_models_model_id: "Model ID",
  ui_models_not_in_catalog: "This model isn’t in /v1/models.",

  ui_modelinfo_loading: "Loading model info…",
  ui_modelinfo_input: "Input",
  ui_modelinfo_output: "Output",
  ui_modelinfo_image: "Image",
  ui_modelinfo_modalities: "Modalities",
  ui_modelinfo_tools: "Tools",

  ui_ratelimit_limits: "Limits",
  ui_ratelimit_5h_tokens: "5-hour limit",
  ui_ratelimit_weekly_tokens: "Weekly limit",
  ui_ratelimit_owner_exempt: "Owner exempt",
  ui_ratelimit_wise_multiplier: "/askwise multiplier",
  ui_ratelimit_footer:
    "Each user has two token budgets — one per rolling 5-hour window and one per week — spent per /ask (/askwise costs the multiplier times more). A request is allowed while both have budget left. Window start times are staggered per user.",
  ui_ratelimit_my_usage: "My Usage",
  ui_ratelimit_5h_window: "5-hour window",
  ui_ratelimit_weekly_window: "Weekly window",
  ui_ratelimit_resets: "Resets",
  ui_ratelimit_reset: "Reset usage",

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
  ui_user_set_language: "Set language",
  ui_user_usage: "Rate Limit Usage",

  ui_spending_title: "Spending",
  ui_spending_day: "Today",
  ui_spending_week: "Last 7 days",
  ui_spending_month: "Last 30 days",
  ui_spending_month_short: (amount) => `30d: ${amount}`,
  ui_spending_footer:
    "Money spent on AI requests, in USD, computed from model pricing. Periods are trailing windows by UTC date.",

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
  ui_chat_models_on_footer: "Model used for this chat.",
  ui_chat_models_off_footer: (list) => `Using global: ${list}`,
  ui_chat_tz: "Timezone",
  ui_chat_tz_on_footer: "Used unless a user has set their own timezone.",
  ui_chat_tz_off_footer: (tz) => `Using global timezone (${tz}).`,
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

  ui_admin_bots: "Character Bots",
  ui_admin_bots_desc: "Managed bots — extra characters with their own persona",
  ui_route_bot_edit: "Edit Bot",
  ui_route_bot_create: "New Bot",
  ui_mbots_all: "Your character bots",
  ui_mbots_empty: "No character bots yet.",
  ui_mbots_footer:
    "Each character is its own Telegram bot with its own avatar, prompt, reminders and memory. It answers only when addressed as /ask@its_username.",
  ui_mbots_create: "New character bot",
  ui_mbots_running: "running",
  ui_mbots_stopped: "stopped",
  ui_mbot_display_name: "Display name",
  ui_mbot_display_name_placeholder: "e.g. Kitty",
  ui_mbot_username: "Username",
  ui_mbot_system_prompt: "System prompt",
  ui_mbot_system_prompt_placeholder: "Describe this character's persona…",
  ui_mbot_system_prompt_footer:
    "Overrides the global prompt for this bot only. All other settings (models, limits, provider) are inherited from the main bot.",
  ui_mbot_status: "Status",
  ui_mbot_avatar: "Avatar",
  ui_mbot_avatar_upload: "Upload image",
  ui_mbot_avatar_footer:
    "A static .jpg/.png. Applied immediately to the running bot via Telegram.",
  ui_mbot_avatar_saved: "Avatar updated.",
  ui_mbot_avatar_failed: "Couldn't set the avatar (is the bot running?).",
  ui_mbot_delete: "Delete bot",
  ui_mbot_delete_confirm:
    "Delete this character bot? It will stop running. Its reminders and memory are left in storage.",
  ui_mbot_not_found: "Bot not found.",
  ui_mbot_save_error: (code) => `Couldn't save: ${code}`,
  ui_mbot_create_intro:
    "Creating a character bot opens @BotFather in Telegram to make a brand-new bot that this bot will manage. When it's done, it appears in the list above.",
  ui_mbot_create_need_manage:
    "First enable bot management for the main bot in the @BotFather Mini App, then come back here.",
  ui_mbot_create_name: "Suggested name",
  ui_mbot_create_name_placeholder: "e.g. Kitty",
  ui_mbot_create_username: "Suggested username",
  ui_mbot_create_username_placeholder: "must end in 'bot'",
  ui_mbot_create_open: "Create in Telegram",
  ui_mbot_create_footer:
    "After Telegram finishes creating the bot, return here and pull to refresh — it will show up, then you can set its prompt and avatar.",
};

const ru: Strings = {
  bot_photo_cant_fetch: "⚠️ Не удалось загрузить прикреплённое фото.",
  bot_voice_cant_fetch: "⚠️ Не удалось загрузить голосовое сообщение.",
  bot_ask_usage:
    "Использование: /ask <текст> (коротко), /askwise <текст> (подробно) — или ответь на сообщение любой из этих команд.",
  bot_rate_limited: (limitedBy, ms) =>
    limitedBy === "weekly"
      ? `Недельный лимит токенов исчерпан. Восстановится примерно через ${etaRu(ms)}.`
      : `Лимит токенов за 5 часов исчерпан. Восстановится примерно через ${etaRu(ms)}.`,
  bot_ai_error: "⚠️ Ошибка ИИ. Попробуй позже.",
  bot_details_summary: "Развернуть ответ",
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
  bot_managed_bot_created: (username) =>
    `✅ Управляемый бот @${username} запущен.`,

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

  ui_admin_prompt: "Промпт",
  ui_admin_prompt_desc: "Модели, персонаж, часовой пояс, порог сворачивания",
  ui_admin_limits: "Лимиты",
  ui_admin_limits_desc: "Бюджеты токенов за 5 часов и за неделю",
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
    "Модель, которую использует бот. Отправляется только первая — у эндпоинта нет серверных запасных вариантов.",
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

  ui_models_model_id: "ID модели",
  ui_models_not_in_catalog: "Этой модели нет в /v1/models.",

  ui_modelinfo_loading: "Загрузка информации о модели…",
  ui_modelinfo_input: "Ввод",
  ui_modelinfo_output: "Вывод",
  ui_modelinfo_image: "Изображение",
  ui_modelinfo_modalities: "Модальности",
  ui_modelinfo_tools: "Инструменты",

  ui_ratelimit_limits: "Лимиты",
  ui_ratelimit_5h_tokens: "Лимит за 5 часов",
  ui_ratelimit_weekly_tokens: "Недельный лимит",
  ui_ratelimit_owner_exempt: "Владелец без лимита",
  ui_ratelimit_wise_multiplier: "Коэффициент /askwise",
  ui_ratelimit_footer:
    "У каждого пользователя два бюджета токенов — на скользящее окно 5 часов и на неделю — списываются за /ask (для /askwise — в коэффициент раз больше). Запрос разрешён, пока в обоих окнах есть бюджет. Начала окон сдвинуты у каждого пользователя по-своему.",
  ui_ratelimit_my_usage: "Моё использование",
  ui_ratelimit_5h_window: "Окно 5 часов",
  ui_ratelimit_weekly_window: "Недельное окно",
  ui_ratelimit_resets: "Сброс",
  ui_ratelimit_reset: "Сбросить использование",

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
  ui_user_set_language: "Задать язык",
  ui_user_usage: "Использование лимита",

  ui_spending_title: "Расходы",
  ui_spending_day: "Сегодня",
  ui_spending_week: "За 7 дней",
  ui_spending_month: "За 30 дней",
  ui_spending_month_short: (amount) => `30д: ${amount}`,
  ui_spending_footer:
    "Деньги, потраченные на запросы к ИИ, в USD, рассчитанные по ценам моделей. Периоды — скользящие окна по датам UTC.",

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
  ui_chat_models_on_footer: "Модель, используемая для этого чата.",
  ui_chat_models_off_footer: (list) => `Используется глобально: ${list}`,
  ui_chat_tz: "Часовой пояс",
  ui_chat_tz_on_footer:
    "Используется, если у пользователя нет своего пояса.",
  ui_chat_tz_off_footer: (tz) => `Используется глобальный пояс (${tz}).`,
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

  ui_admin_bots: "Боты-персонажи",
  ui_admin_bots_desc: "Управляемые боты — дополнительные персонажи со своей персоной",
  ui_route_bot_edit: "Редактирование бота",
  ui_route_bot_create: "Новый бот",
  ui_mbots_all: "Ваши боты-персонажи",
  ui_mbots_empty: "Пока нет ботов-персонажей.",
  ui_mbots_footer:
    "Каждый персонаж — это отдельный Telegram-бот со своей аватаркой, промптом, напоминаниями и памятью. Отвечает только при обращении /ask@его_username.",
  ui_mbots_create: "Новый бот-персонаж",
  ui_mbots_running: "запущен",
  ui_mbots_stopped: "остановлен",
  ui_mbot_display_name: "Отображаемое имя",
  ui_mbot_display_name_placeholder: "напр. Кошечка",
  ui_mbot_username: "Username",
  ui_mbot_system_prompt: "Системный промпт",
  ui_mbot_system_prompt_placeholder: "Опишите персону этого персонажа…",
  ui_mbot_system_prompt_footer:
    "Переопределяет глобальный промпт только для этого бота. Все остальные настройки (модели, лимиты, провайдер) наследуются от основного бота.",
  ui_mbot_status: "Статус",
  ui_mbot_avatar: "Аватар",
  ui_mbot_avatar_upload: "Загрузить изображение",
  ui_mbot_avatar_footer:
    "Статичный .jpg/.png. Применяется к запущенному боту через Telegram немедленно.",
  ui_mbot_avatar_saved: "Аватар обновлён.",
  ui_mbot_avatar_failed: "Не удалось установить аватар (бот запущен?).",
  ui_mbot_delete: "Удалить бота",
  ui_mbot_delete_confirm:
    "Удалить этого бота-персонажа? Он перестанет работать. Его напоминания и память останутся в хранилище.",
  ui_mbot_not_found: "Бот не найден.",
  ui_mbot_save_error: (code) => `Не удалось сохранить: ${code}`,
  ui_mbot_create_intro:
    "Создание бота-персонажа открывает @BotFather в Telegram, чтобы сделать нового бота, которым будет управлять этот бот. После создания он появится в списке выше.",
  ui_mbot_create_need_manage:
    "Сначала включите управление ботами для основного бота в Mini App @BotFather, затем вернитесь сюда.",
  ui_mbot_create_name: "Предлагаемое имя",
  ui_mbot_create_name_placeholder: "напр. Кошечка",
  ui_mbot_create_username: "Предлагаемый username",
  ui_mbot_create_username_placeholder: "должен оканчиваться на 'bot'",
  ui_mbot_create_open: "Создать в Telegram",
  ui_mbot_create_footer:
    "После того как Telegram создаст бота, вернитесь сюда и обновите страницу — он появится, и вы сможете задать ему промпт и аватар.",
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
