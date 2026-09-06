// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { m } from "./message";

// Long-term memory: the facts a user or the bot remembers.
export const factsMessages = {
  ui_route_my_facts: m({
    en: "Memory",
    ru: "Память",
  }),
  ui_main_memory: m({
    en: "Memory",
    ru: "Память",
  }),
  ui_main_my_facts: m({
    en: "What the bot remembers about me",
    ru: "Что бот помнит обо мне",
  }),
  ui_facts_character: m({
    en: "Character",
    ru: "Персонаж",
  }),
  ui_facts_main_bot: m({
    en: "Main bot",
    ru: "Основной бот",
  }),
  ui_facts_header: m({
    en: "Saved facts",
    ru: "Сохранённые факты",
  }),
  ui_facts_empty: m({
    en: "Nothing saved yet.",
    ru: "Пока ничего не сохранено.",
  }),
  ui_facts_add: m({
    en: "Add fact",
    ru: "Добавить факт",
  }),
  ui_facts_key_label: m({
    en: "Key",
    ru: "Ключ",
  }),
  ui_facts_key_placeholder: m({
    en: "favourite_team",
    ru: "favourite_team",
  }),
  ui_facts_value_placeholder: m({
    en: "What should the bot remember?",
    ru: "Что бот должен запомнить?",
  }),
  ui_facts_cancel: m({
    en: "Cancel",
    ru: "Отмена",
  }),
  ui_facts_delete_confirm: m({
    en: "Delete this fact?",
    ru: "Удалить этот факт?",
  }),
  ui_facts_footer: m({
    en: "Notes the bot keeps about you and uses in its replies. Edit or delete them, or add your own.",
    ru: "Заметки, которые бот хранит о тебе и использует в ответах. Их можно редактировать, удалять и добавлять свои.",
  }),
  ui_facts_count: m({
    en: (count: number, cap: number) => `${count} of ${cap} facts used`,
    ru: (count: number, cap: number) => `Занято фактов: ${count} из ${cap}`,
  }),
  ui_facts_error_invalid_key: m({
    en: "The key must be 1–64 Latin letters, digits, or underscores.",
    ru: "Ключ — от 1 до 64 латинских букв, цифр или подчёркиваний.",
  }),
  ui_facts_error_invalid_value: m({
    en: "The text must be 1–500 characters.",
    ru: "Текст — от 1 до 500 символов.",
  }),
  ui_facts_error_limit_reached: m({
    en: "Fact limit reached — delete one before adding another.",
    ru: "Достигнут лимит фактов — удали один, чтобы добавить новый.",
  }),
  ui_facts_error_not_found: m({
    en: "This fact no longer exists.",
    ru: "Этот факт уже не существует.",
  }),
  ui_facts_error_key_exists: m({
    en: "A fact with this key already exists.",
    ru: "Факт с таким ключом уже есть.",
  }),
  ui_facts_save_error: m({
    en: (code: string) => `Could not save: ${code}`,
    ru: (code: string) => `Не удалось сохранить: ${code}`,
  }),
  ui_user_facts_header: m({
    en: "Memory",
    ru: "Память",
  }),
  ui_user_facts_footer: m({
    en: "Facts this character has saved about the user. View-only — the user manages them in their own vault.",
    ru: "Факты, которые персонаж сохранил об этом пользователе. Только просмотр — пользователь управляет ими сам.",
  }),
};
