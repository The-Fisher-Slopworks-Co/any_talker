// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { m } from "./message";

// `/help` and `/start` — the in-bot guide. It covers only what a user cannot
// discover from the Telegram UI: the command menu already lists the commands,
// and the bot reports its own limits when they are hit. The pages are sent with
// `parse_mode: "HTML"`, so any literal `<`, `>` or `&` must be escaped.
export const helpMessages = {
  bot_help_home: m({
    en: [
      "<b>The bot only answers /ask and /askwise.</b> It does not see messages without a command, including replies to its own messages.",
      "",
      "<b>A conversation continues only through replies.</b> To make the bot take earlier messages into account, reply to its message with <code>/ask …</code>. Without a reply, a new conversation starts.",
    ].join("\n"),
    ru: [
      "<b>Бот отвечает только на /ask и /askwise.</b> Сообщения без команды он не видит, в том числе ответы на его сообщения.",
      "",
      "<b>Разговор продолжается только ответом.</b> Чтобы бот учёл предыдущие сообщения, ответьте на его сообщение командой <code>/ask …</code>. Без ответа начинается новый разговор.",
    ].join("\n"),
  }),
  bot_help_dialog: m({
    en: [
      "<b>Conversation</b>",
      "",
      "• Reply to any earlier answer of the bot, and the conversation continues from that point.",
      "• Reply with /ask to someone else's message, and the bot takes it into account: <code>/ask translate</code>, <code>/ask is this true?</code>",
      "• Quote part of a message when replying, and the bot answers about that part.",
      "• Photos, voice messages and videos: send them with an /ask caption or reply to them. A video message (circle) can only be replied to.",
    ].join("\n"),
    ru: [
      "<b>Диалог</b>",
      "",
      "• Можно ответить на любой более ранний ответ бота, и разговор продолжится с этого места.",
      "• Если ответить /ask на чужое сообщение, бот его учтёт: <code>/ask переведи</code>, <code>/ask это правда?</code>",
      "• Если при ответе процитировать часть сообщения, бот ответит именно про неё.",
      "• Фото, голосовые и видео отправляются с подписью /ask или ответом. На кружок можно ответить только командой.",
    ].join("\n"),
  }),
  bot_help_features: m({
    en: [
      "<b>Features</b>",
      "",
      "The bot searches the web, opens links, summarizes YouTube videos, calculates and converts currencies. Just ask.",
      "",
      "• The bot remembers facts about you between conversations. <code>/ask what do you remember about me?</code> shows them, <code>/ask forget …</code> deletes one.",
      "• Name, timezone, gender and language can be changed by asking or in the app via the bot's menu button.",
      "• If an answer went wrong, reply to it with /feedback, and the conversation is attached to the report.",
    ].join("\n"),
    ru: [
      "<b>Возможности</b>",
      "",
      "Бот ищет в интернете, открывает ссылки, пересказывает YouTube-видео, считает и конвертирует валюты. Об этом достаточно просто попросить.",
      "",
      "• Бот запоминает факты о вас между разговорами. <code>/ask что ты обо мне помнишь?</code> покажет их, <code>/ask забудь …</code> удалит.",
      "• Имя, часовой пояс, пол и язык меняются запросом или в приложении через кнопку меню бота.",
      "• Если ответ неудачный, отправьте /feedback ответом на него, и к отчёту приложится разговор.",
    ].join("\n"),
  }),
  bot_help_reminders: m({
    en: [
      "<b>Reminders</b>",
      "",
      "<code>/ask remind me tomorrow at 9 to call the bank</code>",
      "",
      "• Recurring: “every day at 8:30”. Only a fixed interval works, and a series fires 4 times.",
      "• Viewing, moving or cancelling a reminder also works by asking.",
      "• Times follow the timezone from your settings.",
    ].join("\n"),
    ru: [
      "<b>Напоминания</b>",
      "",
      "<code>/ask напомни завтра в 9 позвонить в банк</code>",
      "",
      "• Повторяющиеся: «каждый день в 8:30». Работает только фиксированный интервал, серия срабатывает 4 раза.",
      "• Посмотреть, перенести или отменить напоминание тоже можно запросом.",
      "• Время считается по часовому поясу из настроек.",
    ].join("\n"),
  }),
  bot_help_groups: m({
    en: [
      "<b>Groups</b>",
      "",
      "• If a chat has several characters, address the one you want with <code>/ask@bot_name</code> or by replying to its message.",
      "• A character can continue another one's conversation, but each keeps its own facts about you.",
    ].join("\n"),
    ru: [
      "<b>Группы</b>",
      "",
      "• Если в чате несколько персонажей, к нужному обращаются через <code>/ask@имя_бота</code> или ответом на его сообщение.",
      "• Персонаж может продолжить разговор другого, но факты о вас у каждого свои.",
    ].join("\n"),
  }),
  bot_help_btn_dialog: m({ en: "Conversation", ru: "Диалог" }),
  bot_help_btn_features: m({ en: "Features", ru: "Возможности" }),
  bot_help_btn_reminders: m({ en: "Reminders", ru: "Напоминания" }),
  bot_help_btn_groups: m({ en: "Groups", ru: "Группы" }),
  bot_help_btn_back: m({ en: "← Back", ru: "← Назад" }),
};
