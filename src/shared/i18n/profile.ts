// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { m } from "./message";

// The user's own settings: name, gender, timezone, language.
export const profileMessages = {
  ui_main_display_name: m({
    en: "Display Name",
    ru: "Имя для отображения",
  }),
  ui_main_name: m({
    en: "Name",
    ru: "Имя",
  }),
  ui_main_your_name: m({
    en: "Your name",
    ru: "Ваше имя",
  }),
  ui_main_name_footer: m({
    en: "Name shown to the AI.",
    ru: "Имя, которое видит ИИ.",
  }),
  ui_main_name_err_too_long: m({
    en: "Too long (max 32 characters).",
    ru: "Слишком длинное (макс. 32 символа).",
  }),
  ui_main_name_err_multiline: m({
    en: "Line breaks are not allowed.",
    ru: "Переносы строк недопустимы.",
  }),
  ui_main_name_err_control_char: m({
    en: "Contains hidden or invisible characters.",
    ru: "Содержит скрытые или невидимые символы.",
  }),
  ui_main_name_err_charset: m({
    en: "Only letters, digits, spaces and . ' - are allowed.",
    ru: "Допустимы только буквы, цифры, пробел и . ' -",
  }),
  ui_main_name_err_blocked_token: m({
    en: "Contains a reserved keyword.",
    ru: "Содержит зарезервированное ключевое слово.",
  }),
  ui_main_name_err_no_letter: m({
    en: "Must contain at least one letter.",
    ru: "Должно содержать хотя бы одну букву.",
  }),
  ui_main_gender: m({
    en: "Gender",
    ru: "Пол",
  }),
  ui_main_tell_ai: m({
    en: "Tell the AI",
    ru: "Сообщить ИИ",
  }),
  ui_main_male: m({
    en: "Male",
    ru: "Мужской",
  }),
  ui_main_female: m({
    en: "Female",
    ru: "Женский",
  }),
  ui_main_gender_footer: m({
    en: "Sent to the AI so it uses correct grammatical gender. Off omits the field.",
    ru: "Передаётся ИИ для правильного согласования рода. Выкл — поле опускается.",
  }),
  ui_main_timezone: m({
    en: "Timezone",
    ru: "Часовой пояс",
  }),
  ui_main_use_my_tz: m({
    en: "Use my timezone",
    ru: "Использовать мой пояс",
  }),
  ui_main_tz_footer: m({
    en: "Sent to the AI as the current date/time; also used for times shown in this app. Off uses the chat or global timezone for the AI and your device's timezone here.",
    ru: "Передаётся ИИ как текущие дата и время; также используется для времени в этом приложении. Выкл — для ИИ берётся пояс чата или глобальный, здесь — пояс устройства.",
  }),
  ui_main_time_format: m({
    en: "Time Format",
    ru: "Формат времени",
  }),
  ui_main_time_format_auto: m({
    en: "Auto (as on your device)",
    ru: "Авто (как на устройстве)",
  }),
  ui_main_time_format_footer: m({
    en: "How dates and times are shown in this app. Auto follows your device's format.",
    ru: "Как отображаются дата и время в этом приложении. Авто — по настройкам устройства.",
  }),
  ui_main_language: m({
    en: "Language",
    ru: "Язык",
  }),
  ui_main_language_footer: m({
    en: "Language for the bot UI and AI replies.",
    ru: "Язык интерфейса бота и ответов ИИ.",
  }),
  ui_main_lang_english: m({
    en: "English",
    ru: "Английский",
  }),
  ui_main_lang_russian: m({
    en: "Russian",
    ru: "Русский",
  }),
  ui_main_save_failed: m({
    en: "Couldn't save. Try again.",
    ru: "Не удалось сохранить. Попробуйте ещё раз.",
  }),
  ui_main_reminders: m({
    en: "Reminders",
    ru: "Напоминания",
  }),
  ui_main_my_reminders: m({
    en: "My reminders",
    ru: "Мои напоминания",
  }),
  ui_main_bot_config: m({
    en: "Bot Configuration",
    ru: "Настройки бота",
  }),
  ui_main_admin_panel: m({
    en: "Admin panel",
    ru: "Админ-панель",
  }),
};
