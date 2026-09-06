// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { m } from "./message";

// Managed bots: the admin list, the editor and the creation flow.
export const managedBotsMessages = {
  ui_admin_bots: m({
    en: "Character Bots",
    ru: "Боты-персонажи",
  }),
  ui_admin_bots_desc: m({
    en: "Managed bots — extra characters with their own persona",
    ru: "Управляемые боты — дополнительные персонажи со своей персоной",
  }),
  ui_route_bot_edit: m({
    en: "Edit Bot",
    ru: "Редактирование бота",
  }),
  ui_route_bot_create: m({
    en: "New Bot",
    ru: "Новый бот",
  }),
  ui_mbots_all: m({
    en: "Your character bots",
    ru: "Ваши боты-персонажи",
  }),
  ui_mbots_empty: m({
    en: "No character bots yet.",
    ru: "Пока нет ботов-персонажей.",
  }),
  ui_mbots_footer: m({
    en: "Each character is its own Telegram bot with its own avatar, prompt, reminders and memory. It answers only when addressed as /ask@its_username.",
    ru: "Каждый персонаж — это отдельный Telegram-бот со своей аватаркой, промптом, напоминаниями и памятью. Отвечает только при обращении /ask@его_username.",
  }),
  ui_mbots_create: m({
    en: "New character bot",
    ru: "Новый бот-персонаж",
  }),
  ui_mbots_running: m({
    en: "running",
    ru: "запущен",
  }),
  ui_mbots_stopped: m({
    en: "stopped",
    ru: "остановлен",
  }),
  ui_mbot_display_name: m({
    en: "Display name",
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
    en: "System prompt",
    ru: "Системный промпт",
  }),
  ui_mbot_system_prompt_placeholder: m({
    en: "Describe this character's persona…",
    ru: "Опишите персону этого персонажа…",
  }),
  ui_mbot_system_prompt_footer: m({
    en: "Overrides the global prompt for this bot only. All other settings (models, limits, provider) are inherited from the main bot.",
    ru: "Переопределяет глобальный промпт только для этого бота. Все остальные настройки (модели, лимиты, провайдер) наследуются от основного бота.",
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
    en: "A static .jpg/.png. Applied immediately to the running bot via Telegram.",
    ru: "Статичный .jpg/.png. Применяется к запущенному боту через Telegram немедленно.",
  }),
  ui_mbot_avatar_saved: m({
    en: "Avatar updated.",
    ru: "Аватар обновлён.",
  }),
  ui_mbot_avatar_failed: m({
    en: "Couldn't set the avatar (is the bot running?).",
    ru: "Не удалось установить аватар (бот запущен?).",
  }),
  ui_mbot_delete: m({
    en: "Delete bot",
    ru: "Удалить бота",
  }),
  ui_mbot_delete_confirm: m({
    en: "Delete this character bot? It will stop running. Its reminders and memory are left in storage.",
    ru: "Удалить этого бота-персонажа? Он перестанет работать. Его напоминания и память останутся в хранилище.",
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
    en: "Creating a character bot opens @BotFather in Telegram to make a brand-new bot that this bot will manage. When it's done, it appears in the list above.",
    ru: "Создание бота-персонажа открывает @BotFather в Telegram, чтобы сделать нового бота, которым будет управлять этот бот. После создания он появится в списке выше.",
  }),
  ui_mbot_create_need_manage: m({
    en: "First enable bot management for the main bot in the @BotFather Mini App, then come back here.",
    ru: "Сначала включите управление ботами для основного бота в Mini App @BotFather, затем вернитесь сюда.",
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
    en: "After Telegram finishes creating the bot, return here and pull to refresh — it will show up, then you can set its prompt and avatar.",
    ru: "После того как Telegram создаст бота, вернитесь сюда и обновите страницу — он появится, и вы сможете задать ему промпт и аватар.",
  }),
};
