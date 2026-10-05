// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "../i18n-context";
import { UserAboutSection, type UserAbout } from "./user-about-section";

function render(initial: UserAbout): string {
  return renderToStaticMarkup(
    <I18nProvider lang="en">
      <UserAboutSection
        userId="1"
        fallbackName="Sam Rivera"
        initial={initial}
      />
    </I18nProvider>,
  );
}

test("lists name and gender as rows with Not Set first", () => {
  const html = render({ displayName: null, gender: null });
  expect(html).toContain("About");
  for (const label of ["Name", "Gender"])
    expect(html).toContain(`>${label}</span>`);
  expect(html).toContain('placeholder="Sam Rivera"');
  expect(html).toMatch(/<option value="" selected="">Not Set<\/option>/);
  expect(html).toContain("What the AI calls the user (empty: Sam Rivera)");
});

test("shows the stored name and gender", () => {
  const html = render({ displayName: "Sam", gender: "male" });
  expect(html).toContain('value="Sam"');
  expect(html).toMatch(/<option value="male" selected="">Male<\/option>/);
});
