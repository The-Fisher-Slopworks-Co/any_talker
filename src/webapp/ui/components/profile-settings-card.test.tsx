// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

// A server-render smoke test, like reminder-cap-field.test.tsx: the markup is
// enough to check that each setting is one row showing its current value.

import { test, expect, describe } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { I18nProvider } from "../i18n-context";
import type { DisplayNameError } from "../../../shared/display-name";
import type { Gender } from "../../../shared/types";
import {
  AboutYouSection,
  LanguageRegionSection,
  type ProfileChoices,
} from "./profile-settings-card";

const DEFAULTS: ProfileChoices = { dateFormat: null, language: "en" };

const wrap = (node: ReactNode, lang: "en" | "ru") =>
  renderToStaticMarkup(<I18nProvider lang={lang}>{node}</I18nProvider>);

function renderAbout({
  gender = null,
  nameError = null,
  lang = "en",
}: {
  gender?: Gender | null;
  nameError?: DisplayNameError | null;
  lang?: "en" | "ru";
} = {}): string {
  return wrap(
    <AboutYouSection
      name="Eugene"
      namePlaceholder="Your name"
      nameError={nameError}
      onNameChange={() => {}}
      onNameCommit={() => {}}
      gender={gender}
      onGender={() => {}}
    />,
    lang,
  );
}

function renderRegion({
  choices = DEFAULTS,
  timezone = null,
  lang = "en",
}: {
  choices?: ProfileChoices;
  timezone?: string | null;
  lang?: "en" | "ru";
} = {}): string {
  return wrap(
    <LanguageRegionSection
      choices={choices}
      onChoice={() => {}}
      timezone={timezone}
      onTimezone={() => {}}
    />,
    lang,
  );
}

function selectedOptions(html: string): string[] {
  return [...html.matchAll(/<option value="([^"]*)" selected="">/g)].map(
    (m) => m[1] ?? "",
  );
}

describe("AboutYouSection", () => {
  // No switch revealing a second card: gender is one pop-up row.
  test("renders the name and gender as single rows", () => {
    const html = renderAbout();
    expect(html.match(/<select/g)?.length).toBe(1);
    expect(html).toContain('value="Eugene"');
    expect(html).not.toContain("<button");
  });

  test("offers 'not set' as the first gender and selects it by default", () => {
    const html = renderAbout();
    expect(selectedOptions(html)).toEqual([""]);
    expect(html).toContain(">Not Set<");
  });

  test("shows a stored gender as selected", () => {
    expect(selectedOptions(renderAbout({ gender: "female" }))).toEqual([
      "female",
    ]);
  });

  test("a name error takes over the footer", () => {
    const html = renderAbout({ nameError: "too_long" });
    expect(html).toContain("Too long");
    expect(html).not.toContain("address you correctly");
  });

  test("is translated", () => {
    const html = renderAbout({ lang: "ru" });
    expect(html).toContain("О вас");
    expect(html).toContain("Не указан");
  });
});

describe("LanguageRegionSection", () => {
  test("renders language, timezone and time format as single rows", () => {
    expect(renderRegion().match(/<select/g)?.length).toBe(3);
  });

  test("shows automatic timezone and time format as the first options", () => {
    const html = renderRegion();
    expect(selectedOptions(html)).toEqual(["en", "", ""]);
    expect(html).toContain(">Automatic<");
    expect(html).toContain(">Auto<");
  });

  test("shows stored values as selected", () => {
    const html = renderRegion({
      choices: { dateFormat: "iso", language: "ru" },
      timezone: "Europe/Moscow",
    });
    expect(selectedOptions(html)).toEqual(["ru", "Europe/Moscow", "iso"]);
  });

  // The closed row shows just the city; the area is the group around it.
  test("lists zones by city, grouped by area", () => {
    const html = renderRegion();
    expect(html).toContain('<optgroup label="America">');
    expect(html).toContain('<option value="America/New_York">New York<');
  });

  // A stored zone outside the area/city list must still show as picked.
  test("keeps a bare zone like UTC selectable", () => {
    expect(selectedOptions(renderRegion({ timezone: "UTC" }))).toContain("UTC");
  });

  test("renders the time format samples in the picked timezone", () => {
    const html = renderRegion({ timezone: "Asia/Tokyo" });
    // The sample instant is 15:45 UTC, i.e. 00:45 the next day in Tokyo.
    expect(html).toContain("2027-01-01 00:45:00");
  });

  test("is translated", () => {
    const html = renderRegion({ lang: "ru" });
    expect(html).toContain("Язык и регион");
    expect(html).toContain("Автоматически");
  });
});
