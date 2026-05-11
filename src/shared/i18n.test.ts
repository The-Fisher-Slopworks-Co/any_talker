// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import {
  DEFAULT_LANG,
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
  test("every locale has the same key set", () => {
    const en = Object.keys(MESSAGES.en).sort();
    const ru = Object.keys(MESSAGES.ru).sort();
    expect(ru).toEqual(en);
  });

  test("interpolations match argument shape across locales", () => {
    expect(t("en").bot_rate_limited(3)).toContain("3");
    expect(t("ru").bot_rate_limited(3)).toContain("3");
    expect(t("en").bot_contact_added("Alice")).toContain("Alice");
    expect(t("ru").bot_contact_added("Alice")).toContain("Alice");
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
