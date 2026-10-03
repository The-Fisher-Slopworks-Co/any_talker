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
  ui_facts_key_hint: m({
    en: "Latin letters, digits and underscores.",
    ru: "Латинские буквы, цифры и подчёркивания.",
  }),
  ui_facts_value_label: m({
    en: "Text",
    ru: "Текст",
  }),
  ui_facts_value_count: m({
    en: (count: number, max: number) => `${count} of ${max} characters`,
    ru: (count: number, max: number) => `Символов: ${count} из ${max}`,
  }),
  ui_facts_edit_title: m({
    en: "Edit fact",
    ru: "Изменить факт",
  }),
  ui_facts_new_title: m({
    en: "New fact",
    ru: "Новый факт",
  }),
  ui_facts_delete: m({
    en: "Delete fact",
    ru: "Удалить факт",
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
    en: "Notes the bot uses in replies.",
    ru: "Заметки, которые бот учитывает в ответах.",
  }),
  ui_facts_count: m({
    en: (count: number, cap: number) => `${count} of ${cap} facts used`,
    ru: (count: number, cap: number) => `Занято фактов: ${count} из ${cap}`,
  }),
  ui_facts_error_invalid_key: m({
    en: "Key: 1–64 Latin letters, digits or underscores.",
    ru: "Ключ: 1–64 латинских букв, цифр или подчёркиваний.",
  }),
  ui_facts_error_invalid_value: m({
    en: "Text: 1–500 characters.",
    ru: "Текст: 1–500 символов.",
  }),
  ui_facts_error_limit_reached: m({
    en: "Fact limit reached. Delete one first.",
    ru: "Лимит фактов. Сначала удали один.",
  }),
  ui_facts_error_not_found: m({
    en: "Fact no longer exists.",
    ru: "Факт уже удалён.",
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
};
