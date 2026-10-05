// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "./i18n-context";
import { DateFmtProvider, useDateFmt } from "./datetime-context";

function Short({ ms }: { ms: number }) {
  return <>{useDateFmt().short(ms)}</>;
}

function render(lang: "en" | "ru", ms: number): string {
  return renderToStaticMarkup(
    <I18nProvider lang={lang}>
      <DateFmtProvider dateFormat="en-GB" timezone="UTC">
        <Short ms={ms} />
      </DateFmtProvider>
    </I18nProvider>,
  );
}

test("short() says the relative day in the viewer's language", () => {
  const now = Date.now();
  expect(render("en", now)).toStartWith("Today, ");
  expect(render("ru", now)).toStartWith("Сегодня, ");
  expect(render("en", now - 24 * 3_600_000)).toStartWith("Yesterday, ");
  expect(render("ru", now + 24 * 3_600_000)).toStartWith("Завтра, ");
});
