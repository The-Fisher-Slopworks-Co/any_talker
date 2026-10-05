// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

// Server-render smoke test, like `usage-header.test.tsx`: which of the two
// states (start rows / running promo) the admin card shows.

import { test, expect, describe } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "../i18n-context";
import { DateFmtProvider } from "../datetime-context";
import type { Settings } from "../../../shared/types";
import { LimitBoostCard } from "./limit-boost-card";

function render(boost: Settings["limitBoost"]): string {
  return renderToStaticMarkup(
    <I18nProvider lang="en">
      <DateFmtProvider dateFormat="iso" timezone="UTC">
        <LimitBoostCard boost={boost} save={() => {}} />
      </DateFmtProvider>
    </I18nProvider>,
  );
}

describe("LimitBoostCard markup", () => {
  test("offers a +50% promo form when none is running", () => {
    const html = render(null);
    expect(html).toContain("Start Promo");
    expect(html).toContain('value="50"');
    expect(html).toContain(">%<");
    expect(html).toContain('type="datetime-local"');
    expect(html).not.toContain("End Promo");
    expect(html).not.toContain("Active");
  });

  test("the pill shows the date as text with the picker laid over it, inside the Until label", () => {
    const html = render(null);
    expect(html).toMatch(
      /<label[^>]*>(?:(?!<\/label>).)*Until(?:(?!<\/label>).)*>\d{4}-\d{2}-\d{2}[^<]*<input type="datetime-local"[^>]*opacity-0/,
    );
  });

  test("shows the running promo as rows with a red way to end it", () => {
    const untilMs = Date.UTC(2099, 0, 2, 3, 4, 0);
    const html = render({ percent: 30, untilMs });
    for (const text of ["Status", "Active", "+30%", "2099-01-02"])
      expect(html).toContain(text);
    expect(html).toContain("End Promo");
    expect(html).toContain("text-tg-destructive");
    expect(html).not.toContain("Start Promo");
    expect(html).not.toContain("datetime-local");
  });

  test("treats an expired promo as none", () => {
    const html = render({ percent: 30, untilMs: Date.now() - 1 });
    expect(html).toContain("Start Promo");
  });
});
