// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "../../i18n-context";
import { ADMIN_SECTION_IDS } from "../../lib/routes";
import { ADMIN_SECTION_ICONS, AdminView } from "./admin-view";

describe("AdminView", () => {
  // The icon map is a Record over every section, so this checks that the
  // groups list each section exactly once: none hidden, none twice.
  test("groups every admin section exactly once", () => {
    expect<string[]>([...ADMIN_SECTION_IDS].sort()).toEqual(
      Object.keys(ADMIN_SECTION_ICONS).sort(),
    );
  });

  test("renders the group headers and section rows without descriptions", () => {
    const html = renderToStaticMarkup(
      <I18nProvider lang="en">
        <AdminView onOpenSection={() => {}} />
      </I18nProvider>,
    );
    for (const text of [
      "Spending &amp; Limits",
      "Access",
      "Automation",
      "Budget Caps",
      "Spending",
      "API Token",
    ]) {
      expect(html).toContain(text);
    }
    expect(html).not.toContain("USD spend caps");
    expect(html.match(/<button/g)?.length).toBe(ADMIN_SECTION_IDS.length);
  });
});
