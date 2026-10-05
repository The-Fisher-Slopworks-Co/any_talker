// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "../i18n-context";
import { AccessRows } from "./access-rows";

function render(whitelisted: boolean, blacklisted: boolean): string {
  return renderToStaticMarkup(
    <I18nProvider lang="en">
      <AccessRows
        kind="users"
        id="1"
        label="Sam"
        whitelisted={whitelisted}
        blacklisted={blacklisted}
        footer="Footer text"
      />
    </I18nProvider>,
  );
}

// The switch button carries its state and name as attributes.
function switchOf(html: string, label: string): string {
  return html.match(new RegExp(`<button[^>]*aria-label="${label}"[^>]*>`))![0];
}

test("shows Allowed and Blocked as switches in their current state", () => {
  const html = render(true, false);
  expect(html).toContain("Access");
  expect(switchOf(html, "Allowed")).toContain('aria-checked="true"');
  expect(switchOf(html, "Blocked")).toContain('aria-checked="false"');
  expect(html).toContain("Footer text");
});

test("renders a blocked entry's switch on", () => {
  expect(switchOf(render(false, true), "Blocked")).toContain(
    'aria-checked="true"',
  );
});
