// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { m } from "./message";

// Managed bots: the admin list, the editor and the creation flow.
export const managedBotsMessages = {
  ui_admin_bots: m({
    en: "Character Bots",
    ru: "Боты-персонажи",
  }),
  ui_route_bot_edit: m({
    en: "Edit Bot",
    ru: "Бот",
  }),
  ui_route_bot_create: m({
    en: "New Bot",
    ru: "Новый бот",
  }),
  ui_mbots_footer: m({
    en: "Each character is a separate Telegram bot, answering only to /ask@its_username.",
    ru: "Каждый персонаж — отдельный Telegram-бот, отвечает только на /ask@его_username.",
  }),
  ui_mbots_create: m({
    en: "New Character Bot",
    ru: "Новый бот-персонаж",
  }),
  ui_mbots_running: m({
    en: "Running",
    ru: "Запущен",
  }),
  ui_mbots_stopped: m({
    en: "Stopped",
    ru: "Остановлен",
  }),
  ui_mbot_display_name: m({
    en: "Display Name",
    ru: "Отображаемое имя",
  }),
  ui_mbot_display_name_placeholder: m({
    en: "e.g. Kitty",
    ru: "напр. Кошечка",
  }),
  ui_mbot_username: m({
    en: "Username",
    ru: "Username",
  }),
  ui_mbot_system_prompt: m({
    en: "System Prompt",
    ru: "Системный промпт",
  }),
  ui_mbot_system_prompt_placeholder: m({
    en: "Describe this character's persona…",
    ru: "Опишите персону этого персонажа…",
  }),
  ui_mbot_system_prompt_footer: m({
    en: "Replaces the global prompt for this bot only.",
    ru: "Заменяет глобальный промпт только для этого бота.",
  }),
  ui_mbot_status: m({
    en: "Status",
    ru: "Статус",
  }),
  ui_mbot_avatar: m({
    en: "Avatar",
    ru: "Аватар",
  }),
  ui_mbot_avatar_upload: m({
    en: "Upload image",
    ru: "Загрузить изображение",
  }),
  ui_mbot_avatar_footer: m({
    en: "Static .jpg/.png, applied immediately.",
    ru: "Статичный .jpg/.png, применяется сразу.",
  }),
  ui_mbot_avatar_saved: m({
    en: "Avatar updated.",
    ru: "Аватар обновлён.",
  }),
  ui_mbot_avatar_edit: m({
    en: "Edit",
    ru: "Изменить",
  }),
  ui_mbot_avatar_failed: m({
    en: "Couldn't set the avatar (is the bot running?).",
    ru: "Не удалось установить аватар (бот запущен?).",
  }),
  ui_mbot_delete: m({
    en: "Delete Bot",
    ru: "Удалить бота",
  }),
  ui_mbot_delete_confirm: m({
    en: "Delete this bot? It stops running; reminders and memory stay in storage.",
    ru: "Удалить бота? Он остановится; напоминания и память останутся в хранилище.",
  }),
  ui_mbot_not_found: m({
    en: "Bot not found.",
    ru: "Бот не найден.",
  }),
  ui_mbot_save_error: m({
    en: (code: string) => `Couldn't save: ${code}`,
    ru: (code: string) => `Не удалось сохранить: ${code}`,
  }),
  ui_mbot_create_intro: m({
    en: "Opens @BotFather to create a new bot managed by this one.",
    ru: "Откроет @BotFather для создания нового бота под управлением этого.",
  }),
  ui_mbot_create_need_manage: m({
    en: "First enable bot management for the main bot in the @BotFather Mini App.",
    ru: "Сначала включите управление ботами для основного бота в Mini App @BotFather.",
  }),
  ui_mbot_create_name: m({
    en: "Suggested name",
    ru: "Предлагаемое имя",
  }),
  ui_mbot_create_name_placeholder: m({
    en: "e.g. Kitty",
    ru: "напр. Кошечка",
  }),
  ui_mbot_create_username: m({
    en: "Suggested username",
    ru: "Предлагаемый username",
  }),
  ui_mbot_create_username_placeholder: m({
    en: "must end in 'bot'",
    ru: "должен оканчиваться на 'bot'",
  }),
  ui_mbot_create_open: m({
    en: "Create in Telegram",
    ru: "Создать в Telegram",
  }),
  ui_mbot_create_footer: m({
    en: "Once created, refresh here to set its prompt and avatar.",
    ru: "После создания обновите страницу, чтобы задать промпт и аватар.",
  }),
};
