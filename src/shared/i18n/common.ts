// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { m } from "./message";

// Shared Web App chrome: buttons, route titles, timestamp notes.
export const commonMessages = {
  ui_loading: m({
    en: "Loading…",
    ru: "Загрузка…",
  }),
  ui_saving: m({
    en: "Saving…",
    ru: "Сохранение…",
  }),
  ui_save: m({
    en: "Save",
    ru: "Сохранить",
  }),
  ui_saved: m({
    en: "Saved",
    ru: "Сохранено",
  }),
  ui_updating: m({
    en: "Updating…",
    ru: "Обновление…",
  }),
  ui_remove: m({
    en: "Remove",
    ru: "Удалить",
  }),
  ui_yes: m({
    en: "yes",
    ru: "да",
  }),
  ui_no: m({
    en: "no",
    ru: "нет",
  }),
  ui_dash: m({
    en: "—",
    ru: "—",
  }),
  ui_route_settings: m({
    en: "Settings",
    ru: "Настройки",
  }),
  ui_route_admin: m({
    en: "Bot Admin",
    ru: "Админка",
  }),
  ui_route_user_settings: m({
    en: "User Settings",
    ru: "Настройки пользователя",
  }),
  ui_route_chat_settings: m({
    en: "Chat Settings",
    ru: "Настройки чата",
  }),
  ui_route_my_reminders: m({
    en: "My Reminders",
    ru: "Мои напоминания",
  }),
  // Note shown wherever the Web App renders timestamps: which timezone they
  // are displayed in (the viewer's device, or the profile override).
  ui_time_note_local: m({
    en: "Times are shown in your device's local timezone.",
    ru: "Время указано в локальном часовом поясе вашего устройства.",
  }),
  ui_time_note_tz: m({
    en: (tz: string) => `Times are shown in the ${tz} timezone.`,
    ru: (tz: string) => `Время указано в часовом поясе ${tz}.`,
  }),
  ui_tz_area: m({
    en: "Area",
    ru: "Регион",
  }),
  ui_tz_location: m({
    en: "Location",
    ru: "Местоположение",
  }),
};
