// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

// Server-render smoke test, like `usage-header.test.tsx`: the admin limits tab
// holds only the limit settings — the admin's own usage lives in the header.

import { test, expect, describe } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "../../i18n-context";
import { DateFmtProvider } from "../../datetime-context";
import { DEFAULT_SETTINGS } from "../../../../shared/types";
import { RateLimitTab } from "./rate-limit-tab";

function render(): string {
  return renderToStaticMarkup(
    <I18nProvider lang="en">
      <DateFmtProvider dateFormat="iso" timezone="UTC">
        <RateLimitTab settings={DEFAULT_SETTINGS} onSaved={() => {}} />
      </DateFmtProvider>
    </I18nProvider>,
  );
}

describe("RateLimitTab markup", () => {
  test("shows the limit settings without the admin's own usage", () => {
    const html = render();
    expect(html).toContain("5-hour limit ($)");
    expect(html).toContain("Limit promo");
    expect(html).not.toContain("My Usage");
    expect(html).not.toContain("Reset usage");
  });
});
