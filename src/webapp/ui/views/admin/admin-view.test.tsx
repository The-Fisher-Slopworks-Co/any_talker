// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "../../i18n-context";
import { ADMIN_SECTION_IDS } from "../../lib/routes";
import { ADMIN_SECTION_ICONS, AdminHome, AdminView } from "./admin-view";
import type { AdminSummary } from "../../../../shared/types/admin-summary";

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

  const summary: AdminSummary = {
    bots: 2,
    budgetEnabled: true,
    whitelistEnabled: false,
    users: 5,
    chats: 3,
    reminders: 4,
    quarantined: 0,
    checks: 1,
    newFeedback: 7,
    apiTokenCreated: false,
  };
  const home = (value: AdminSummary | null) =>
    renderToStaticMarkup(
      <I18nProvider lang="en">
        <AdminHome summary={value} onOpenSection={() => {}} />
      </I18nProvider>,
    );

  test("fills the rows with the summary's values and the feedback badge", () => {
    const html = home(summary);
    for (const text of [">2<", ">On<", ">Off<", ">5<", ">3<", ">4<", ">0<"]) {
      expect(html).toContain(text);
    }
    expect(html).toContain("Not Created");
    expect(html).toContain('aria-label="7 new"');
    expect(html).toMatch(/bg-tg-destructive[^>]*>7</);
  });

  test("shows no values without a summary, and no badge at zero", () => {
    expect(home(null)).not.toContain('text-tg-hint">');
    expect(home({ ...summary, newFeedback: 0 })).not.toContain(
      "bg-tg-destructive",
    );
  });
});
