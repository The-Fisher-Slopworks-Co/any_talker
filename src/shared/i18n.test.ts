// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import {
  DEFAULT_LANG,
  DOMAIN_MESSAGES,
  MESSAGES,
  isValidLang,
  languageSection,
  normalizeLang,
  resolveLang,
  t,
} from "./i18n";

describe("normalizeLang", () => {
  test("maps full and short ISO codes", () => {
    expect(normalizeLang("en")).toBe("en");
    expect(normalizeLang("ru")).toBe("ru");
    expect(normalizeLang("ru-RU")).toBe("ru");
    expect(normalizeLang("en-US")).toBe("en");
    expect(normalizeLang("EN")).toBe("en");
  });

  test("returns null for unsupported and nullish input", () => {
    expect(normalizeLang("de")).toBeNull();
    expect(normalizeLang("fr-CA")).toBeNull();
    expect(normalizeLang("")).toBeNull();
    expect(normalizeLang(null)).toBeNull();
    expect(normalizeLang(undefined)).toBeNull();
  });
});

describe("resolveLang", () => {
  test("stored preference wins", () => {
    expect(resolveLang("en", "ru-RU")).toBe("en");
    expect(resolveLang("ru", "en-US")).toBe("ru");
  });

  test("falls back to Telegram code", () => {
    expect(resolveLang(null, "ru-RU")).toBe("ru");
    expect(resolveLang(null, "en")).toBe("en");
  });

  test("falls back to default when nothing matches", () => {
    expect(resolveLang(null, null)).toBe(DEFAULT_LANG);
    expect(resolveLang(null, "de")).toBe(DEFAULT_LANG);
    expect(resolveLang(null, undefined)).toBe(DEFAULT_LANG);
  });
});

describe("isValidLang", () => {
  test("accepts only en and ru", () => {
    expect(isValidLang("en")).toBe(true);
    expect(isValidLang("ru")).toBe(true);
    expect(isValidLang("de")).toBe(false);
    expect(isValidLang("")).toBe(false);
    expect(isValidLang(null)).toBe(false);
    expect(isValidLang(undefined)).toBe(false);
    expect(isValidLang(0)).toBe(false);
  });
});

describe("MESSAGES parity", () => {
  // Both locales come from one catalogue, so they can't drift apart — but the
  // catalogue is spread together from the domain modules, and a key defined in
  // two of them would silently lose one of its translations.
  test("no key is defined by two domain modules", () => {
    const owner = new Map<string, string>();
    const clashes: string[] = [];
    for (const [domain, messages] of Object.entries(DOMAIN_MESSAGES)) {
      for (const key of Object.keys(messages)) {
        const first = owner.get(key);
        if (first !== undefined) clashes.push(`${key}: ${first} + ${domain}`);
        else owner.set(key, domain);
      }
    }
    expect(clashes).toEqual([]);
    expect(owner.size).toBe(Object.keys(MESSAGES.en).length);
  });

  test("interpolations match argument shape across locales", () => {
    expect(t("en").bot_rate_limited("fiveHour", 3 * 60_000)).toContain("3");
    expect(t("ru").bot_rate_limited("fiveHour", 3 * 60_000)).toContain("3");
    expect(t("en").bot_contact_added("Alice")).toContain("Alice");
    expect(t("ru").bot_contact_added("Alice")).toContain("Alice");
  });

  test("bot_reminder_scheduled renders RU with DD.MM.YYYY", () => {
    expect(
      t("ru").bot_reminder_scheduled({
        year: 2026,
        month: 5,
        day: 7,
        hour: 10,
        minute: 0,
        timezone: "Asia/Yekaterinburg",
      }),
    ).toBe(
      "Было создано напоминание на 07.05.2026 в 10:00 (Asia/Yekaterinburg)",
    );
  });

  test("bot_reminder_scheduled renders EN with YYYY-MM-DD", () => {
    expect(
      t("en").bot_reminder_scheduled({
        year: 2026,
        month: 5,
        day: 7,
        hour: 10,
        minute: 0,
        timezone: "Asia/Yekaterinburg",
      }),
    ).toBe("Reminder set for 2026-05-07 at 10:00 (Asia/Yekaterinburg)");
  });

  test("bot_settings_updated decodes values and joins changes", () => {
    const changes = [
      { field: "name" as const, value: "Vasya" },
      { field: "timezone" as const, value: "Europe/Moscow" },
      { field: "gender" as const, value: "female" },
      { field: "language" as const, value: "ru" },
    ];
    expect(t("en").bot_settings_updated(changes)).toBe(
      "Settings updated — name: Vasya, timezone: Europe/Moscow, gender: female, language: Russian",
    );
    expect(t("ru").bot_settings_updated(changes)).toBe(
      "Настройки обновлены — имя: Vasya, часовой пояс: Europe/Moscow, пол: женский, язык: русский",
    );
  });

  test("bot_settings_updated renders a cleared field", () => {
    const changes = [{ field: "gender" as const, value: null }];
    expect(t("en").bot_settings_updated(changes)).toBe(
      "Settings updated — gender: reset to default",
    );
    expect(t("ru").bot_settings_updated(changes)).toBe(
      "Настройки обновлены — пол: сброшено",
    );
  });
});

describe("languageSection", () => {
  test("returns English instruction for en", () => {
    expect(languageSection("en")).toContain("English");
  });

  test("returns Russian instruction for ru", () => {
    expect(languageSection("ru")).toContain("русском");
  });
});
