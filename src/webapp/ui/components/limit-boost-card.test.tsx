// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

// Server-render smoke test, like `usage-header.test.tsx`: which of the two
// states (start form / running promo) the admin card shows.

import { test, expect, describe } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "../i18n-context";
import { DateFmtProvider } from "../datetime-context";
import { DEFAULT_SETTINGS, type Settings } from "../../../shared/types";
import { LimitBoostCard } from "./limit-boost-card";

function render(limitBoost: Settings["limitBoost"]): string {
  return renderToStaticMarkup(
    <I18nProvider lang="en">
      <DateFmtProvider dateFormat="iso" timezone="UTC">
        <LimitBoostCard
          settings={{ ...DEFAULT_SETTINGS, limitBoost }}
          onSaved={() => {}}
        />
      </DateFmtProvider>
    </I18nProvider>,
  );
}

describe("LimitBoostCard markup", () => {
  test("offers a +50% promo form when none is running", () => {
    const html = render(null);
    expect(html).toContain("Start promo");
    expect(html).toContain('value="50"');
    expect(html).toContain('type="datetime-local"');
    expect(html).not.toContain("End promo now");
  });

  test("shows the running promo with a way to end it", () => {
    const untilMs = Date.UTC(2099, 0, 2, 3, 4, 0);
    const html = render({ percent: 30, untilMs });
    expect(html).toContain("+30% until 2099-01-02 03:04:00");
    expect(html).toContain("End promo now");
    expect(html).not.toContain("Start promo");
  });

  test("treats an expired promo as none", () => {
    const html = render({ percent: 30, untilMs: Date.now() - 1 });
    expect(html).toContain("Start promo");
  });
});
