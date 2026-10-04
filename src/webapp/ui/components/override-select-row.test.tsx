// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 The Fisher Slopworks Co

import { test, expect } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "../i18n-context";
import { OverrideSelectRow, type Override } from "./override-select-row";

const OPTIONS = [
  { value: null, label: "Auto" },
  { value: "price", label: "Price" },
];

function render(override: Override<string>): string {
  return renderToStaticMarkup(
    <I18nProvider lang="en">
      <OverrideSelectRow
        label="Provider Sort"
        globalLabel="Latency"
        options={OPTIONS}
        override={override}
        onChange={() => {}}
      />
    </I18nProvider>,
  );
}

test("puts the global choice first and selects it while nothing is overridden", () => {
  const html = render({ own: false });
  expect(html).toContain(">Provider Sort</span>");
  expect(html).toMatch(
    /<option value="_global" selected="">Global \(Latency\)<\/option><option value="_none">Auto<\/option><option value="price">Price<\/option>/,
  );
});

test("selects the chat's own value, including an own null", () => {
  expect(render({ own: true, value: "price" })).toContain(
    '<option value="price" selected="">Price</option>',
  );
  expect(render({ own: true, value: null })).toContain(
    '<option value="_none" selected="">Auto</option>',
  );
});
