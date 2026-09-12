// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

// A server-render smoke test, like reminder-cap-field.test.tsx: the markup is
// enough to check that the settings sit in one compact card, each row showing
// its current value.

import { test, expect, describe } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "../i18n-context";
import type { DisplayNameError } from "../../../shared/display-name";
import {
  ProfileSettingsCard,
  type ProfileChoices,
} from "./profile-settings-card";

const DEFAULTS: ProfileChoices = { dateFormat: null, language: "en" };

function render({
  choices = DEFAULTS,
  nameError = null,
  timezone = null,
  lang = "en",
}: {
  choices?: ProfileChoices;
  nameError?: DisplayNameError | null;
  timezone?: string | null;
  lang?: "en" | "ru";
} = {}): string {
  return renderToStaticMarkup(
    <I18nProvider lang={lang}>
      <ProfileSettingsCard
        name="Eugene"
        namePlaceholder="Your name"
        nameError={nameError}
        onNameChange={() => {}}
        onNameCommit={() => {}}
        choices={choices}
        onChoice={() => {}}
        timezone={timezone}
      />
    </I18nProvider>,
  );
}

function selectedOptions(html: string): string[] {
  return [...html.matchAll(/<option value="([^"]*)" selected="">/g)].map(
    (m) => m[1] ?? "",
  );
}

describe("ProfileSettingsCard", () => {
  // The long checkmark lists are gone: each choice is one row with a picker.
  test("renders the name, time format and language as single rows", () => {
    const html = render();
    expect(html.match(/<select/g)?.length).toBe(2);
    expect(html).toContain('value="Eugene"');
    expect(html).not.toContain("<button");
  });

  test("shows auto time format as the picker's first option", () => {
    expect(selectedOptions(render())).toEqual(["", "en"]);
    expect(render()).toContain(">Auto<");
  });

  test("shows stored values as selected", () => {
    const html = render({ choices: { dateFormat: "iso", language: "ru" } });
    expect(selectedOptions(html)).toEqual(["iso", "ru"]);
  });

  test("renders the time format samples in the given timezone", () => {
    const html = render({ timezone: "Asia/Tokyo" });
    // The sample instant is 15:45 UTC, i.e. 00:45 the next day in Tokyo.
    expect(html).toContain("2027-01-01 00:45:00");
  });

  test("the footer carries one short hint", () => {
    expect(render()).toContain("Changes are saved automatically");
  });

  test("a name error takes over the footer", () => {
    const html = render({ nameError: "too_long" });
    expect(html).toContain("Too long");
    expect(html).not.toContain("Changes are saved automatically");
  });

  test("is translated", () => {
    const html = render({ lang: "ru" });
    expect(html).toContain("Формат времени");
    expect(html).toContain("Изменения сохраняются сразу");
  });
});
