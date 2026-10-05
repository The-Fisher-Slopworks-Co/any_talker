// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect, describe } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "../../i18n-context";
import { DEFAULT_SETTINGS, type Settings } from "../../../../shared/types";
import { BudgetTab } from "./budget-tab";

function render(settings: Settings): string {
  return renderToStaticMarkup(
    <I18nProvider lang="en">
      <BudgetTab settings={settings} onSaved={() => {}} />
    </I18nProvider>,
  );
}

describe("BudgetTab markup", () => {
  test("autosaves: no save button, grouped under their headers", () => {
    const html = render(DEFAULT_SETTINGS);
    expect(html).not.toContain("Save");
    for (const text of [
      "Enforce Budget Caps",
      "Exempt Owner",
      "Hard Caps",
      ">Digest<",
      ">Spike Alerts<",
      "× baseline",
    ]) {
      expect(html).toContain(text);
    }
    expect(html).toContain('role="switch"');
  });

  test("the footer no longer claims the owner is never blocked", () => {
    expect(render(DEFAULT_SETTINGS)).not.toContain("Owner is never blocked");
  });

  test("the digest interval shows only while the digest is on", () => {
    const off = {
      ...DEFAULT_SETTINGS,
      anomaly: { ...DEFAULT_SETTINGS.anomaly, digestEnabled: false },
    };
    expect(render(off)).not.toContain("Send Every");
    const on = {
      ...DEFAULT_SETTINGS,
      anomaly: { ...DEFAULT_SETTINGS.anomaly, digestEnabled: true },
    };
    expect(render(on)).toContain("Send Every");
  });
});
